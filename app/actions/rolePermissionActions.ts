"use server";

import { connectToDatabase } from "@/lib/mongodb";
import {
  StaffRole,
  UserSession,
  RolePermissionsMap,
  AllRolePermissions,
  PermissionKey,
  CustomRole,
} from "@/app/types";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
} from "@/lib/rbac";
import { normalizeSession } from "@/lib/rbac";

const ALL_ROLES: StaffRole[] = [
  "admin",
  "sub_admin",
  "consultant_doctor",
  "main_sister",
  "main_attendant",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge DB record with defaults so every key is always present */
function mergeWithDefaults(
  role: StaffRole,
  dbPerms?: Partial<RolePermissionsMap> | null
): RolePermissionsMap {
  const defaults = DEFAULT_ROLE_PERMISSIONS[role];
  if (!dbPerms) return { ...defaults };

  const merged: Partial<RolePermissionsMap> = { ...defaults };
  for (const key of PERMISSION_KEYS) {
    if (key in dbPerms) {
      (merged as RolePermissionsMap)[key] = (dbPerms as RolePermissionsMap)[key];
    }
  }
  return merged as RolePermissionsMap;
}

// ---------------------------------------------------------------------------
// getAllRolePermissions
// ---------------------------------------------------------------------------

/**
 * Fetch the effective permissions for every role.
 * DB records overlay the hard-coded defaults.
 */
export async function getAllRolePermissions(): Promise<AllRolePermissions> {
  try {
    const { db } = await connectToDatabase();
    const docs = await db
      .collection("role_permissions")
      .find({ role: { $in: ALL_ROLES } })
      .toArray();

    // Build a map of DB records keyed by role
    const dbMap: Partial<Record<StaffRole, Partial<RolePermissionsMap>>> = {};
    for (const doc of docs) {
      dbMap[doc.role as StaffRole] = doc.permissions as Partial<RolePermissionsMap>;
    }

    const result = {} as AllRolePermissions;
    for (const role of ALL_ROLES) {
      result[role] = mergeWithDefaults(role, dbMap[role]);
    }
    return result;
  } catch (err) {
    console.error("getAllRolePermissions error:", err);
    // Fall back to pure defaults
    const result = {} as AllRolePermissions;
    for (const role of ALL_ROLES) {
      result[role] = { ...DEFAULT_ROLE_PERMISSIONS[role] };
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// getRolePermissionsForRole
// ---------------------------------------------------------------------------

/** Fetch effective permissions for a single role */
export async function getRolePermissionsForRole(
  role: StaffRole
): Promise<RolePermissionsMap> {
  try {
    const { db } = await connectToDatabase();
    const doc = await db.collection("role_permissions").findOne({ role });
    return mergeWithDefaults(role, doc?.permissions as Partial<RolePermissionsMap> | null);
  } catch {
    return { ...DEFAULT_ROLE_PERMISSIONS[role] };
  }
}

// ---------------------------------------------------------------------------
// updateRolePermissions
// ---------------------------------------------------------------------------

export async function updateRolePermissions(
  role: StaffRole,
  permissions: RolePermissionsMap,
  actor: UserSession
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = normalizeSession(actor);

    // Only admin can change role permissions
    if (session.role !== "admin") {
      return { ok: false, error: "Only Admin can modify role permissions." };
    }

    // Validate all keys are present
    const missingKeys = PERMISSION_KEYS.filter(
      (k) => !(k in permissions)
    );
    if (missingKeys.length > 0) {
      return {
        ok: false,
        error: `Missing permission keys: ${missingKeys.join(", ")}`,
      };
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    await db.collection("role_permissions").updateOne(
      { role },
      {
        $set: {
          role,
          permissions,
          updatedAt: now,
          updatedBy: session.userId ?? "unknown",
        },
      },
      { upsert: true }
    );

    return { ok: true };
  } catch (err: unknown) {
    console.error("updateRolePermissions error:", err);
    return { ok: false, error: "Failed to save permissions." };
  }
}

// ---------------------------------------------------------------------------
// resetRolePermissionsToDefault
// ---------------------------------------------------------------------------

export async function resetRolePermissionsToDefault(
  role: StaffRole,
  actor: UserSession
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = normalizeSession(actor);
    if (session.role !== "admin") {
      return { ok: false, error: "Only Admin can reset role permissions." };
    }

    const { db } = await connectToDatabase();
    await db.collection("role_permissions").deleteOne({ role });

    return { ok: true };
  } catch (err) {
    console.error("resetRolePermissionsToDefault error:", err);
    return { ok: false, error: "Failed to reset permissions." };
  }
}

// ---------------------------------------------------------------------------
// checkPermission — lightweight UI gate helper
// ---------------------------------------------------------------------------

/**
 * Check whether a role has a specific permission.
 * Falls back to hardcoded defaults on DB error (fail-safe, not fail-open).
 */
export async function checkPermission(
  role: StaffRole,
  key: PermissionKey
): Promise<boolean> {
  try {
    const perms = await getRolePermissionsForRole(role);
    return perms[key] ?? false;
  } catch {
    return DEFAULT_ROLE_PERMISSIONS[role]?.[key] ?? false;
  }
}

// ---------------------------------------------------------------------------
// Custom Role CRUD
// ---------------------------------------------------------------------------

/** Convert a display label to a URL-safe slug */
function labelToSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Fetch all user-defined custom roles */
export async function getCustomRoles(): Promise<CustomRole[]> {
  try {
    const { db } = await connectToDatabase();
    const docs = await db
      .collection("custom_roles")
      .find({})
      .sort({ createdAt: 1 })
      .toArray();
    return docs.map((d) => ({
      id: d.id as string,
      label: d.label as string,
      createdAt: new Date(d.createdAt as string | number | Date),
      createdBy: d.createdBy as string | undefined,
    }));
  } catch (err) {
    console.error("getCustomRoles error:", err);
    return [];
  }
}

/** Create a new custom role and optionally seed its permissions from a base role */
export async function createCustomRole(
  label: string,
  baseRole: string | null,
  actor: UserSession
): Promise<{ ok: boolean; roleId?: string; error?: string }> {
  try {
    const session = normalizeSession(actor);
    if (session.role !== "admin") {
      return { ok: false, error: "Only Admin can create roles." };
    }

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      return { ok: false, error: "Role name cannot be empty." };
    }
    if (trimmedLabel.length < 2 || trimmedLabel.length > 40) {
      return { ok: false, error: "Role name must be 2–40 characters." };
    }

    const roleId = labelToSlug(trimmedLabel);
    if (!roleId) {
      return { ok: false, error: "Invalid role name — use letters, numbers, or spaces." };
    }

    const { db } = await connectToDatabase();

    // Check for conflicts (built-in or existing custom)
    const builtIn: string[] = [
      "admin", "sub_admin", "consultant_doctor", "main_sister", "main_attendant",
    ];
    if (builtIn.includes(roleId)) {
      return { ok: false, error: `"${trimmedLabel}" conflicts with a built-in role.` };
    }
    const existing = await db.collection("custom_roles").findOne({ id: roleId });
    if (existing) {
      return { ok: false, error: `A role with the name "${trimmedLabel}" already exists.` };
    }

    const now = new Date();

    // Seed permissions from baseRole (built-in default) or start empty
    let seedPermissions: RolePermissionsMap;
    if (baseRole && baseRole in DEFAULT_ROLE_PERMISSIONS) {
      seedPermissions = { ...DEFAULT_ROLE_PERMISSIONS[baseRole as StaffRole] };
    } else {
      // Start with all permissions off
      const empty: Partial<RolePermissionsMap> = {};
      for (const k of PERMISSION_KEYS) empty[k] = false;
      seedPermissions = empty as RolePermissionsMap;
    }

    // Store metadata
    await db.collection("custom_roles").insertOne({
      id: roleId,
      label: trimmedLabel,
      createdAt: now,
      createdBy: session.userId ?? "unknown",
    });

    // Store initial permissions in role_permissions
    await db.collection("role_permissions").updateOne(
      { role: roleId },
      {
        $set: {
          role: roleId,
          permissions: seedPermissions,
          updatedAt: now,
          updatedBy: session.userId ?? "unknown",
        },
      },
      { upsert: true }
    );

    return { ok: true, roleId };
  } catch (err) {
    console.error("createCustomRole error:", err);
    return { ok: false, error: "Failed to create role." };
  }
}

/** Delete a custom role (built-in roles are protected) */
export async function deleteCustomRole(
  roleId: string,
  actor: UserSession
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = normalizeSession(actor);
    if (session.role !== "admin") {
      return { ok: false, error: "Only Admin can delete roles." };
    }

    const builtIn = [
      "admin", "sub_admin", "consultant_doctor", "main_sister", "main_attendant",
    ];
    if (builtIn.includes(roleId)) {
      return { ok: false, error: "Built-in roles cannot be deleted." };
    }

    const { db } = await connectToDatabase();
    await Promise.all([
      db.collection("custom_roles").deleteOne({ id: roleId }),
      db.collection("role_permissions").deleteOne({ role: roleId }),
    ]);

    return { ok: true };
  } catch (err) {
    console.error("deleteCustomRole error:", err);
    return { ok: false, error: "Failed to delete role." };
  }
}

/** Fetch permissions for a custom role by its ID */
export async function getCustomRolePermissions(
  roleId: string
): Promise<RolePermissionsMap> {
  try {
    const { db } = await connectToDatabase();
    const doc = await db.collection("role_permissions").findOne({ role: roleId });
    if (!doc?.permissions) {
      const empty: Partial<RolePermissionsMap> = {};
      for (const k of PERMISSION_KEYS) empty[k] = false;
      return empty as RolePermissionsMap;
    }
    // Fill missing keys with false
    const base: Partial<RolePermissionsMap> = {};
    for (const k of PERMISSION_KEYS) {
      base[k] = (doc.permissions as Record<string, boolean>)[k] ?? false;
    }
    return base as RolePermissionsMap;
  } catch {
    const empty: Partial<RolePermissionsMap> = {};
    for (const k of PERMISSION_KEYS) empty[k] = false;
    return empty as RolePermissionsMap;
  }
}

/** Update permissions for a custom role */
export async function updateCustomRolePermissions(
  roleId: string,
  permissions: RolePermissionsMap,
  actor: UserSession
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = normalizeSession(actor);
    if (session.role !== "admin") {
      return { ok: false, error: "Only Admin can modify role permissions." };
    }
    const { db } = await connectToDatabase();
    await db.collection("role_permissions").updateOne(
      { role: roleId },
      {
        $set: {
          role: roleId,
          permissions,
          updatedAt: new Date(),
          updatedBy: session.userId ?? "unknown",
        },
      },
      { upsert: true }
    );
    return { ok: true };
  } catch (err) {
    console.error("updateCustomRolePermissions error:", err);
    return { ok: false, error: "Failed to save permissions." };
  }
}
