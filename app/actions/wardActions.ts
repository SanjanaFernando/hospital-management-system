"use server";

import { connectToDatabase } from "@/lib/mongodb";
import {
  getWardWithPatientsData,
  getWardsWithPatientsData,
} from "@/lib/hospital-data";
import { Ward, UserSession } from "@/app/types";
import { ObjectId } from "mongodb";
import { revalidateTag } from "next/cache";
import {
  assertPermission,
  canManageWardActions,
  canUpdateBedStatus,
  normalizeSession,
} from "@/lib/rbac";

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
  wardId: string
): Promise<Ward | null> {
  return await getWardWithPatientsData(wardId);
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
  type: "normal" | "icu" = "normal"
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
