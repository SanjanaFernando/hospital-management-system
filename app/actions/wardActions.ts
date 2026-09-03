"use server";

import { connectToDatabase } from "@/lib/mongodb";
import {
  getWardWithPatientsData,
  getWardsWithPatientsData,
} from "@/lib/hospital-data";
import { Ward, UserSession, BedGender } from "@/app/types";
import { ObjectId } from "mongodb";
import { revalidateTag } from "next/cache";
import {
  assertPermission,
  canManageWardActions,
  canUpdateBedStatus,
  normalizeSession,
} from "@/lib/rbac";
import { createNotification } from "@/app/actions/notificationActions";
import { createUserLog } from "@/app/actions/logActions";
// Helper function to recursively serialize MongoDB documents (convert ObjectIds to strings)
function serializeDoc(doc: unknown): unknown {
  if (doc === null || doc === undefined) {
    return doc;
  }

  if (doc instanceof Date) {
    return doc.toISOString();
  }

  if (Array.isArray(doc)) {
    return doc.map(serializeDoc);
  }

  if (typeof doc === "object") {
    const obj = doc as Record<string, unknown>;

    // Check if it's a MongoDB ObjectId
    if ("_bsontype" in obj && obj._bsontype === "ObjectId") {
      return String(obj);
    }

    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeDoc(value);
    }
    return serialized;
  }

  return doc;
}

export async function getWardsWithPatients(): Promise<Ward[]> {
  try {
    return await getWardsWithPatientsData();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Server Action Error:", errorMsg);
    throw new Error(`Failed to fetch wards: ${errorMsg}`);
  }
}

export async function getWardWithPatients(
  wardId: string,
  bypassCache = false
): Promise<Ward | null> {
  return await getWardWithPatientsData(wardId, bypassCache);
}

export async function updateBedStatus(
  bedId: string,
  newStatus: "available" | "occupied" | "maintenance",
  actor: UserSession
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`📡 Server Action: Updating bed ${bedId} to ${newStatus}...`);
    const session = normalizeSession(actor);
    const { db } = await connectToDatabase();

    // Build query - try multiple ways to find the bed
    const query: Record<string, unknown> = {
      $or: [
        { bedId }, // Search by bedId field
        { id: bedId }, // Search by id field
      ],
    };

    // Try to add ObjectId search if it's a valid format
    if (ObjectId.isValid(bedId)) {
      (query.$or as Record<string, unknown>[]).push({
        _id: new ObjectId(bedId),
      });
    }

    const bed = await db.collection("beds").findOne(query);

    if (!bed) {
      return { success: false, error: "Bed not found" };
    }

    const wardId = (bed.wardId as string) || "";
    assertPermission(
      canUpdateBedStatus(session, wardId),
      "You do not have permission to update bed status in this ward."
    );

    if (
      session.role === "main_attendant" &&
      newStatus !== "available" &&
      newStatus !== "maintenance"
    ) {
      return {
        success: false,
        error: "Main Attendant can only mark beds as available or maintenance.",
      };
    }

    const result = await db
      .collection("beds")
      .updateOne(
        { _id: bed._id },
        { $set: { status: newStatus, updatedAt: new Date() } }
      );

    if (result.matchedCount === 0) {
      return { success: false, error: "Bed not found" };
    }

    revalidateTag("beds", "max");
    revalidateTag("wards", "max");
    revalidateTag("patients", "max");
    revalidateTag("dashboard", "max");

    await createNotification({
      type: "bed_status_changed",
      title: "Bed Status Updated",
      message: `Bed ${bed.bedId || bedId} in ${wardId || bed.wardId} is now ${newStatus}`,
      wardId: wardId || bed.wardId,
      severity: newStatus === "maintenance" ? "warning" : "info",
    });

    console.log("✅ Bed status updated successfully");
    return { success: true };
  } catch (error) {
    console.error("❌ Error updating bed status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function addBedToWard(
  wardId: string,
  actor: UserSession,
  type: "normal" | "icu" = "normal",
  gender: BedGender = "Unisex"
): Promise<{ success: boolean; bedId?: string; error?: string }> {
  try {
    if (!wardId) {
      return { success: false, error: "Ward ID is required" };
    }

    const session = normalizeSession(actor);
    const { db } = await connectToDatabase();

    // 🔍 Find ward
    let ward = await db.collection("wards").findOne({ wardId });

    if (!ward && ObjectId.isValid(wardId)) {
      ward = await db
        .collection("wards")
        .findOne({ _id: new ObjectId(wardId) });
    }

    if (!ward) {
      return { success: false, error: "Ward not found" };
    }

    const wardDoc = serializeDoc(ward) as Record<string, unknown>;
    const effectiveWardId = (wardDoc?.wardId as string) || wardId;

    // 🔐 Permission check
    assertPermission(
      canManageWardActions(session, effectiveWardId),
      "You do not have permission to add beds in this ward."
    );

    // 🛏️ Determine bed type
    const bedType = type === "icu" ? "ICU" : "NORMAL";

    // 🔢 Get last bed number (separate numbering per type)
    const lastBed = await db
      .collection("beds")
      .find({ wardId: effectiveWardId, type: bedType })
      .sort({ bedNumber: -1 })
      .limit(1)
      .next();

    const lastBedDoc = lastBed
      ? (serializeDoc(lastBed) as Record<string, unknown>)
      : null;

    const nextBedNumber = ((lastBedDoc?.bedNumber as number) || 0) + 1;

    // 🆔 Create bed ID
    const prefix = type === "icu" ? "icu" : "bed";
    const nextBedId = `${effectiveWardId}-${prefix}-${nextBedNumber}`;

    // 💾 Insert new bed
    await db.collection("beds").insertOne({
      bedId: nextBedId,
      wardId: effectiveWardId,
      bedNumber: nextBedNumber,
      type: bedType,
      gender,
      status: "available",
      patientId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 📝 Update ward timestamp
    await db
      .collection("wards")
      .updateOne(
        { wardId: effectiveWardId },
        { $set: { updatedAt: new Date() } }
      );

    revalidateTag("beds", "max");
    revalidateTag("wards", "max");
    revalidateTag("dashboard", "max");

    return { success: true, bedId: nextBedId };
  } catch (error) {
    console.error("❌ Error adding bed to ward:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Ward CRUD Operations (Admins & Sub-Admins)
// ---------------------------------------------------------------------------

export async function createWardAction(
  name: string,
  wardIdInput?: string,
  normalBedsCount: number = 20,
  icuBedsCount: number = 4,
  actor?: UserSession
): Promise<{ success: boolean; wardId?: string; error?: string }> {
  try {
    const session = normalizeSession(actor || { role: "admin" });
    if (session.role !== "admin" && session.role !== "sub_admin") {
      return { success: false, error: "Only Admins and Sub-Admins can create wards." };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: "Ward name is required." };
    }

    const { db } = await connectToDatabase();

    // Determine wardId slug
    let rawSlug = (wardIdInput || trimmedName)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!rawSlug.startsWith("ward-") && !/^\d+$/.test(rawSlug)) {
      rawSlug = `ward-${rawSlug}`;
    }

    // Check if wardId already exists
    const existing = await db.collection("wards").findOne({ wardId: rawSlug });
    if (existing) {
      return { success: false, error: `A ward with ID "${rawSlug}" already exists.` };
    }

    const now = new Date();

    // Insert ward document
    await db.collection("wards").insertOne({
      wardId: rawSlug,
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
    });

    // Create normal beds
    const bedsToInsert: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= normalBedsCount; i++) {
      bedsToInsert.push({
        bedId: `${rawSlug}-normal-${i}`,
        wardId: rawSlug,
        bedNumber: i,
        type: "NORMAL",
        status: "available",
        patientId: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Create ICU beds
    for (let i = 1; i <= icuBedsCount; i++) {
      bedsToInsert.push({
        bedId: `${rawSlug}-icu-${i}`,
        wardId: rawSlug,
        bedNumber: i,
        type: "ICU",
        status: "available",
        patientId: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (bedsToInsert.length > 0) {
      await db.collection("beds").insertMany(bedsToInsert);
    }

    try {
      await createUserLog({
        action: "ward_added",
        actor: session,
        wardId: rawSlug,
        targetName: trimmedName,
        details: `Added ward "${trimmedName}" with ${normalBedsCount} normal beds and ${icuBedsCount} ICU beds`,
      });
    } catch {
      // Audit logging should never break main operations
    }
    revalidateTag("wards", "max");
    revalidateTag("beds", "max");
    revalidateTag("dashboard", "max");

    return { success: true, wardId: rawSlug };
  } catch (error) {
    console.error("❌ Error creating ward:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create ward.",
    };
  }
}

export async function updateWardAction(
  wardId: string,
  input: { name?: string },
  actor?: UserSession
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = normalizeSession(actor || { role: "admin" });
    if (session.role !== "admin" && session.role !== "sub_admin") {
      return { success: false, error: "Only Admins and Sub-Admins can edit wards." };
    }

    if (!wardId) return { success: false, error: "Ward ID is required." };

    const { db } = await connectToDatabase();
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name && input.name.trim()) {
      updateData.name = input.name.trim();
    }

    const result = await db
      .collection("wards")
      .updateOne({ wardId }, { $set: updateData });

    if (result.matchedCount === 0) {
      return { success: false, error: "Ward not found." };
    }
    
    try {
      await createUserLog({
        action: "ward_updated",
        actor: session,
        wardId,
        targetName: (updateData.name as string) || wardId,
        details: `Updated ward ${wardId}`,
      });
    } catch {
      // Audit logging should never break main operations
    }

    revalidateTag("wards", "max");
    revalidateTag("dashboard", "max");

    return { success: true };
  } catch (error) {
    console.error("❌ Error updating ward:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update ward.",
    };
  }
}

export async function deleteWardAction(
  wardId: string,
  actor?: UserSession
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = normalizeSession(actor || { role: "admin" });
    if (session.role !== "admin" && session.role !== "sub_admin") {
      return { success: false, error: "Only Admins and Sub-Admins can delete wards." };
    }

    if (!wardId) return { success: false, error: "Ward ID is required." };

    const { db } = await connectToDatabase();


    // Fetch ward name before deletion for logging purposes
    const wardDoc = await db.collection("wards").findOne({ wardId });
    const wardName = (wardDoc?.name as string) || wardId;

    // Delete ward, beds, and form configs
    await Promise.all([
      db.collection("wards").deleteOne({ wardId }),
      db.collection("beds").deleteMany({ wardId }),
      db.collection("ward_form_configs").deleteOne({ wardId }),
    ]);

    try {
      await createUserLog({
        action: "ward_deleted",
        actor: session,
        wardId,
        targetName: wardName,
        details: `Deleted ward "${wardName}" (${wardId})`,
      });
    } catch {
      // Audit logging should never break main operations
    }

       
    revalidateTag("wards", "max");
    revalidateTag("beds", "max");
    revalidateTag("dashboard", "max");

    return { success: true };
  } catch (error) {
    console.error("❌ Error deleting ward:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete ward.",
    };
  }
}

