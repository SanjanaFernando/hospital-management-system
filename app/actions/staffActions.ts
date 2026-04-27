"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { StaffMember, UserSession } from "@/app/types";
import { assertPermission, canManageStaff, normalizeSession } from "@/lib/rbac";

interface RegisterStaffInput {
  name: string;
  role: "consultant_doctor" | "main_sister" | "main_attendant";
  wardId: string;
  actor: UserSession;
}

export async function registerStaffMember(
  input: RegisterStaffInput
): Promise<{ success: boolean; error?: string }> {
  const { name, role, wardId, actor } = input;

  if (!name.trim() || !role || !wardId) {
    return { success: false, error: "Name, role, and ward are required" };
  }

  try {
    const session = normalizeSession(actor);
    assertPermission(
      canManageStaff(session),
      "Only admin can register ward staff."
    );

    const { db } = await connectToDatabase();

    await db.collection("staff_members").insertOne({
      id: `staff-${Date.now()}`,
      name: name.trim(),
      role,
      wardId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getStaffMembers(
  actor: UserSession
): Promise<StaffMember[]> {
  const session = normalizeSession(actor);
  assertPermission(
    canManageStaff(session),
    "Only admin can view staff registry."
  );

  const { db } = await connectToDatabase();
  const docs = await db
    .collection("staff_members")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map((doc) => ({
    id: String(doc.id || doc._id),
    name: String(doc.name || ""),
    role: doc.role as StaffMember["role"],
    wardId: String(doc.wardId || ""),
    createdAt: new Date(doc.createdAt || Date.now()),
  }));
}
