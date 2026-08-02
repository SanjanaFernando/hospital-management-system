"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { revalidateTag, revalidatePath } from "next/cache";
import { UserSession, WardFormField, WardFormConfig } from "@/app/types";
import { normalizeSession, canManageStaff } from "@/lib/rbac";
import { getDefaultWardFields } from "@/lib/wardFormConfigs";

export async function getWardFormConfig(
  wardId: string
): Promise<WardFormField[]> {
  if (!wardId) return [];

  try {
    const { db } = await connectToDatabase();
    const normalizedWardId = wardId.toLowerCase();
    const doc = await db
      .collection("ward_form_configs")
      .findOne({ wardId: normalizedWardId });

    if (doc && Array.isArray(doc.fields)) {
      return doc.fields as WardFormField[];
    }

    // Default to empty array if no config saved yet
    return [];
  } catch (error) {
    console.error(`Failed to load ward form config for ${wardId}:`, error);
    return [];
  }
}

export async function updateWardFormConfig(
  wardId: string,
  fields: WardFormField[],
  actor: UserSession
): Promise<{ success: boolean; error?: string }> {
  const session = normalizeSession(actor);

  // Admins and Sub-Admins can edit ward registration form schemas
  if (!canManageStaff(session)) {
    return {
      success: false,
      error: "Only Admins and Sub-Admins can edit ward registration forms.",
    };
  }

  if (!wardId) {
    return { success: false, error: "Ward ID is required." };
  }

  try {
    const { db } = await connectToDatabase();
    const normalizedWardId = wardId.toLowerCase();

    // Clean and validate fields
    const cleanedFields: WardFormField[] = fields.map((f, idx) => ({
      id: f.id || `field_${idx}_${Date.now()}`,
      label: f.label.trim(),
      type: f.type,
      required: Boolean(f.required),
      options:
        f.type === "select" && Array.isArray(f.options)
          ? f.options.map((o) => o.trim()).filter(Boolean)
          : undefined,
      placeholder: f.placeholder?.trim() || undefined,
      defaultValue: f.defaultValue?.trim() || undefined,
    }));

    await db.collection("ward_form_configs").updateOne(
      { wardId: normalizedWardId },
      {
        $set: {
          wardId: normalizedWardId,
          fields: cleanedFields,
          updatedAt: new Date(),
          updatedBy: session.displayName || session.userId || "Admin",
        },
      },
      { upsert: true }
    );

    revalidateTag("ward-form-configs", "max");
    revalidatePath(`/wards/${normalizedWardId}`);
    revalidatePath(`/wards/${normalizedWardId}/register`);
    revalidatePath(`/admin/ward-forms`);

    return { success: true };
  } catch (error) {
    console.error(`Failed to update ward form config for ${wardId}:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save form schema.",
    };
  }
}

export async function resetWardFormConfig(
  wardId: string,
  actor: UserSession
): Promise<{ success: boolean; error?: string }> {
  const session = normalizeSession(actor);

  if (!canManageStaff(session)) {
    return {
      success: false,
      error: "Only Admins and Sub-Admins can reset ward registration forms.",
    };
  }

  try {
    const { db } = await connectToDatabase();
    const normalizedWardId = wardId.toLowerCase();

    await db.collection("ward_form_configs").deleteOne({ wardId: normalizedWardId });

    revalidateTag("ward-form-configs", "max");
    revalidatePath(`/wards/${normalizedWardId}`);
    revalidatePath(`/wards/${normalizedWardId}/register`);
    revalidatePath(`/admin/ward-forms`);

    return { success: true };
  } catch (error) {
    console.error(`Failed to reset ward form config for ${wardId}:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reset form schema.",
    };
  }
}
