"use server";

import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { connectToDatabase } from "@/lib/mongodb";
import { StaffRole, UserSession } from "@/app/types";
import {
  hashPassword,
  generateSalt,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  generateUserId,
} from "@/lib/auth";
import { assertPermission, canManageStaff, normalizeSession } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/rbac";
import { createUserLog } from "@/app/actions/logActions";
import { sendWelcomeEmail, sendPasswordResetEmail } from "@/lib/email";

const AUTH_COOKIE_NAME = "hospital-auth-token";

/**
 * Generate a random temporary password.
 * Format: 10 alphanumeric characters (mix of uppercase, lowercase, digits).
 */
function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

// ---------------------------------------------------------------------------
// Get the currently authenticated user from the JWT cookie
// ---------------------------------------------------------------------------

export async function getCurrentUser(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }

  const wardIds = Array.isArray(payload.wardIds)
    ? (payload.wardIds as string[])
    : payload.wardId
      ? [payload.wardId as string]
      : [];

  return {
    userId: payload.userId,
    role: payload.role as StaffRole,
    wardId: payload.wardId,
    wardIds,
    displayName: payload.displayName,
  };
}

// ---------------------------------------------------------------------------
// Check if user must change password (for first-login redirect)
// ---------------------------------------------------------------------------

export async function checkMustChangePassword(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return false;
  }

  const { db } = await connectToDatabase();
  const user = await db
    .collection("users")
    .findOne({ userId: payload.userId });

  if (!user) {
    return false;
  }

  return Boolean(user.mustChangePassword);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

interface LoginResult {
  success: boolean;
  error?: string;
  mustChangePassword?: boolean;
}

export async function loginUser(
  userId: string,
  password: string
): Promise<LoginResult> {
  if (!userId?.trim() || !password) {
    return { success: false, error: "User ID and password are required." };
  }

  const trimmedId = userId.trim();

  try {
    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne({ userId: trimmedId });

    if (!user) {
      return { success: false, error: "Invalid User ID or password." };
    }

    if (!user.isActive) {
      return {
        success: false,
        error: "Your account has been deactivated. Contact admin.",
      };
    }

    const passwordValid = verifyPassword(
      password,
      user.passwordHash as string,
      user.salt as string
    );

    if (!passwordValid) {
      return { success: false, error: "Invalid User ID or password." };
    }

    // Create JWT token
    const token = createSessionToken({
      userId: user.userId as string,
      role: user.role as string,
      wardId: user.wardId as string | undefined,
      wardIds: (user.wardIds || (user.wardId ? [user.wardId] : [])) as string[],
      displayName: user.displayName as string,
    });

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return {
      success: true,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, error: "An error occurred during login." };
  }
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logoutUser(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

interface ChangePasswordResult {
  success: boolean;
  error?: string;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  if (!currentPassword || !newPassword) {
    return {
      success: false,
      error: "Current and new passwords are required.",
    };
  }

  if (newPassword.length < 6) {
    return {
      success: false,
      error: "New password must be at least 6 characters.",
    };
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userId) {
      return { success: false, error: "Not authenticated." };
    }

    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne({ userId: currentUser.userId });

    if (!user) {
      return { success: false, error: "User not found." };
    }

    const valid = verifyPassword(
      currentPassword,
      user.passwordHash as string,
      user.salt as string
    );

    if (!valid) {
      return { success: false, error: "Current password is incorrect." };
    }

    const newSalt = generateSalt();
    const newHash = hashPassword(newPassword, newSalt);

    await db.collection("users").updateOne(
      { userId: currentUser.userId },
      {
        $set: {
          passwordHash: newHash,
          salt: newSalt,
          mustChangePassword: false,
          updatedAt: new Date(),
        },
      }
    );

    // Re-issue token (in case mustChangePassword changed)
    const token = createSessionToken({
      userId: user.userId as string,
      role: user.role as string,
      wardId: user.wardId as string | undefined,
      wardIds: (user.wardIds || (user.wardId ? [user.wardId] : [])) as string[],
      displayName: user.displayName as string,
    });

    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });

    return { success: true };
  } catch (error) {
    console.error("Change password error:", error);
    return { success: false, error: "An error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Create user (admin-only)
// ---------------------------------------------------------------------------

interface CreateUserInput {
  displayName: string;
  email: string;
  role: StaffRole;
  wardId?: string;
  wardIds?: string[];
  actor: UserSession;
}

interface CreateUserResult {
  success: boolean;
  userId?: string;
  error?: string;
}

export async function createUser(
  input: CreateUserInput
): Promise<CreateUserResult> {
  const { displayName, email, role, wardId, wardIds } = input;

  // Identity/permission decisions must come from the verified session cookie,
  // never from the caller-supplied `input.actor` (server actions are callable
  // directly with a forged payload, so that value cannot be trusted).
  const actor = await getCurrentUser();
  if (!actor) {
    return { success: false, error: "Not authenticated." };
  }

  if (!displayName?.trim() || !email?.trim() || !role) {
    return {
      success: false,
      error: "Name, email, and role are required.",
    };
  }

  // Do not allow creating new primary admins from UI
  if (role === "admin") {
    return {
      success: false,
      error: "Creating primary Admin accounts is not permitted from the UI.",
    };
  }

  // Non-admins must have at least one ward assigned
  const hasWardAssignment = wardId || (wardIds && wardIds.length > 0);
  const isTargetAdminLike = role === "sub_admin";

  if (!isTargetAdminLike && !hasWardAssignment) {
    return {
      success: false,
      error: "At least one ward assignment is required for clinical roles.",
    };
  }

  // Prevent Sub Admins from creating Admin or Sub Admin roles to avoid privilege escalation
  if (actor.role === "sub_admin" && isTargetAdminLike) {
    return {
      success: false,
      error: "Sub Admins are not permitted to create Admin or Sub Admin accounts.",
    };
  }

  try {
    const session = normalizeSession(actor);
    assertPermission(
      canManageStaff(session),
      "Only admin can create users."
    );

    const { db } = await connectToDatabase();

    // Check if email is already used
    const existing = await db
      .collection("users")
      .findOne({ email: email.trim().toLowerCase() });

    if (existing) {
      return { success: false, error: "A user with this email already exists." };
    }

    const userId = await generateUserId(db);
    const salt = generateSalt();
    // Generate a random temporary password
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = hashPassword(temporaryPassword, salt);

    const normalizedWardIds = isTargetAdminLike
      ? undefined
      : (wardIds && wardIds.length > 0 ? wardIds : (wardId ? [wardId] : []));
    
    const primaryWardId = normalizedWardIds && normalizedWardIds.length > 0
      ? normalizedWardIds[0]
      : undefined;

    await db.collection("users").insertOne({
      userId,
      email: email.trim().toLowerCase(),
      passwordHash,
      salt,
      role,
      wardId: primaryWardId,
      wardIds: normalizedWardIds,
      displayName: displayName.trim(),
      mustChangePassword: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (primaryWardId) {
      await db.collection("staff_members").insertOne({
        id: `staff-${userId}`,
        name: displayName.trim(),
        role: role as Exclude<StaffRole, "admin" | "sub_admin">,
        wardId: primaryWardId,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Send welcome email with credentials
    await sendWelcomeEmail({
      to: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      userId,
      temporaryPassword,
      role: ROLE_LABELS[role] || role,
      wardId: primaryWardId,
    });

    await createUserLog({
      action: "staff_registered",
      actor,
      wardId: primaryWardId || "all",
      targetName: displayName.trim(),
      details: `Created user ${userId} (${role.replace(/_/g, " ")})` + 
               (normalizedWardIds ? ` for ${normalizedWardIds.join(", ")}` : ""),
    });

    return { success: true, userId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Get all users (admin-only)
// ---------------------------------------------------------------------------

export interface UserListItem {
  userId: string;
  email: string;
  role: StaffRole;
  wardId?: string;
  wardIds?: string[];
  displayName: string;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

export async function getUsers(
  _clientActor: UserSession
): Promise<UserListItem[]> {
  const actor = await getCurrentUser();
  if (!actor) {
    throw new Error("Not authenticated.");
  }
  const session = normalizeSession(actor);
  assertPermission(canManageStaff(session), "Only admin can view users.");

  const { db } = await connectToDatabase();
  const docs = await db
    .collection("users")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map((doc) => ({
    userId: String(doc.userId),
    email: String(doc.email || ""),
    role: doc.role as StaffRole,
    wardId: doc.wardId ? String(doc.wardId) : undefined,
    wardIds: Array.isArray(doc.wardIds) ? doc.wardIds : (doc.wardId ? [doc.wardId] : []),
    displayName: String(doc.displayName || ""),
    mustChangePassword: Boolean(doc.mustChangePassword),
    isActive: Boolean(doc.isActive),
    createdAt: new Date(doc.createdAt || Date.now()).toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Reset user password (admin-only) — resets to their Gmail
// ---------------------------------------------------------------------------

export async function resetUserPassword(
  targetUserId: string,
  _clientActor: UserSession
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentUser();
  if (!actor) {
    return { success: false, error: "Not authenticated." };
  }
  const session = normalizeSession(actor);
  assertPermission(
    canManageStaff(session),
    "Only admin can reset passwords."
  );

  try {
    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne({ userId: targetUserId });

    if (!user) {
      return { success: false, error: "User not found." };
    }

    if (targetUserId === "100000") {
      return {
        success: false,
        error: "The primary Admin password cannot be reset via the UI. It can only be reset by executing backend code/scripts.",
      };
    }

    const newSalt = generateSalt();
    const temporaryPassword = generateTemporaryPassword();
    const newHash = hashPassword(temporaryPassword, newSalt);

    await db.collection("users").updateOne(
      { userId: targetUserId },
      {
        $set: {
          passwordHash: newHash,
          salt: newSalt,
          mustChangePassword: true,
          updatedAt: new Date(),
        },
      }
    );

    // Send password reset email
    await sendPasswordResetEmail({
      to: user.email as string,
      displayName: user.displayName as string,
      userId: targetUserId,
      temporaryPassword,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Toggle user active status (admin-only)
// ---------------------------------------------------------------------------

export async function toggleUserActive(
  targetUserId: string,
  _clientActor: UserSession
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentUser();
  if (!actor) {
    return { success: false, error: "Not authenticated." };
  }
  const session = normalizeSession(actor);
  assertPermission(
    canManageStaff(session),
    "Only admin can manage user accounts."
  );

  // Prevent deactivating yourself
  if (actor.userId === targetUserId) {
    return { success: false, error: "You cannot deactivate your own account." };
  }

  try {
    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne({ userId: targetUserId });

    if (!user) {
      return { success: false, error: "User not found." };
    }

    // Prevent Sub Admins from deactivating Admin or Sub Admin accounts
    if (actor.role === "sub_admin" && (user.role === "admin" || user.role === "sub_admin")) {
      return {
        success: false,
        error: "Sub Admins are not permitted to manage Admin or Sub Admin accounts.",
      };
    }

    // Do not allow deactivating primary Admins
    if (user.role === "admin") {
      return {
        success: false,
        error: "Primary Admin accounts cannot be deactivated.",
      };
    }

    if (!user) {
      return { success: false, error: "User not found." };
    }

    await db.collection("users").updateOne(
      { userId: targetUserId },
      {
        $set: {
          isActive: !user.isActive,
          updatedAt: new Date(),
        },
      }
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Update user (admin-only)
// ---------------------------------------------------------------------------

interface UpdateUserInput {
  displayName: string;
  email: string;
  role: StaffRole;
  wardId?: string;
  wardIds?: string[];
}

export async function updateUser(
  targetUserId: string,
  input: UpdateUserInput,
  _clientActor: UserSession
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentUser();
  if (!actor) {
    return { success: false, error: "Not authenticated." };
  }
  const session = normalizeSession(actor);
  assertPermission(canManageStaff(session), "Only admin can update users.");

  const { displayName, email, role, wardId, wardIds } = input;

  if (!displayName?.trim() || !email?.trim() || !role) {
    return { success: false, error: "Name, email, and role are required." };
  }

  // Do not allow promoting/assigning primary Admin role from UI
  if (role === "admin") {
    return {
      success: false,
      error: "Assigning or promoting users to the primary Admin role is not permitted.",
    };
  }

  const hasWardAssignment = wardId || (wardIds && wardIds.length > 0);
  const isTargetAdminLike = role === "sub_admin";

  if (!isTargetAdminLike && !hasWardAssignment) {
    return {
      success: false,
      error: "At least one ward assignment is required for clinical roles.",
    };
  }

  // Prevent Sub Admins from assigning Admin or Sub Admin roles
  if (actor.role === "sub_admin" && isTargetAdminLike) {
    return {
      success: false,
      error: "Sub Admins are not permitted to assign Admin or Sub Admin roles.",
    };
  }

  try {
    const { db } = await connectToDatabase();

    // Check target user's current role before updating
    const targetUser = await db.collection("users").findOne({ userId: targetUserId });
    if (!targetUser) {
      return { success: false, error: "User not found." };
    }

    // Prevent Sub Admins from modifying Admin or Sub Admin accounts
    if (actor.role === "sub_admin" && (targetUser.role === "admin" || targetUser.role === "sub_admin")) {
      return {
        success: false,
        error: "Sub Admins are not permitted to modify Admin or Sub Admin accounts.",
      };
    }

    // Do not allow editing/modifying primary Admins
    if (targetUser.role === "admin") {
      return {
        success: false,
        error: "Primary Admin accounts cannot be edited or modified.",
      };
    }

    // Check if email is already used by another user
    const existing = await db.collection("users").findOne({
      email: email.trim().toLowerCase(),
      userId: { $ne: targetUserId }
    });

    if (existing) {
      return { success: false, error: "A user with this email already exists." };
    }

    const normalizedWardIds = isTargetAdminLike
      ? undefined
      : (wardIds && wardIds.length > 0 ? wardIds : (wardId ? [wardId] : []));

    const primaryWardId = normalizedWardIds && normalizedWardIds.length > 0
      ? normalizedWardIds[0]
      : undefined;

    await db.collection("users").updateOne(
      { userId: targetUserId },
      {
        $set: {
          email: email.trim().toLowerCase(),
          role,
          wardId: primaryWardId,
          wardIds: normalizedWardIds,
          displayName: displayName.trim(),
          updatedAt: new Date(),
        }
      }
    );

    // Also update staff_members if it exists
    if (!isTargetAdminLike && primaryWardId) {
      await db.collection("staff_members").updateOne(
        { userId: targetUserId },
        {
          $set: {
            name: displayName.trim(),
            role,
            wardId: primaryWardId,
            updatedAt: new Date(),
          }
        },
        { upsert: true }
      );
    } else {
      // If role changed to admin, remove from staff_members
      await db.collection("staff_members").deleteOne({ userId: targetUserId });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Delete user (admin-only)
// ---------------------------------------------------------------------------

export async function deleteUser(
  targetUserId: string,
  _clientActor: UserSession
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentUser();
  if (!actor) {
    return { success: false, error: "Not authenticated." };
  }
  const session = normalizeSession(actor);
  assertPermission(canManageStaff(session), "Only admin can delete users.");

  if (actor.userId === targetUserId) {
    return { success: false, error: "You cannot delete your own account." };
  }

  try {
    const { db } = await connectToDatabase();

    const user = await db.collection("users").findOne({ userId: targetUserId });
    if (!user) {
      return { success: false, error: "User not found." };
    }

    // Prevent Sub Admins from deleting Admin or Sub Admin accounts
    if (actor.role === "sub_admin" && (user.role === "admin" || user.role === "sub_admin")) {
      return {
        success: false,
        error: "Sub Admins are not permitted to delete Admin or Sub Admin accounts.",
      };
    }

    // Do not allow deleting primary Admins
    if (user.role === "admin") {
      return {
        success: false,
        error: "Primary Admin accounts cannot be deleted.",
      };
    }

    await db.collection("users").deleteOne({ userId: targetUserId });
    await db.collection("staff_members").deleteOne({ userId: targetUserId });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

