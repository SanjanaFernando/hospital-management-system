"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { Ward, Patient, Bed, UserSession } from "@/app/types";
import { reorderQueueWithAi } from "@/lib/queueAi";
import { ObjectId } from "mongodb";
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
    console.log("📡 Server Action: Fetching wards with patients...");
    const { db } = await connectToDatabase();

    // Fetch all wards
    const wards = await db.collection("wards").find({}).toArray();

    // For each ward, fetch patients and beds
    const wardsWithData = await Promise.all(
      wards.map(async (ward: Record<string, unknown>) => {
        const wardSerialized = serializeDoc(ward) as Record<string, unknown>;
        const wardId = wardSerialized?.wardId as string;

        // Fetch patients for this ward
        const allPatients = await db
          .collection("patients")
          .find({ wardId })
          .toArray();
        const patientsSerialized = allPatients.map(
          (p) => serializeDoc(p) as Record<string, unknown>
        );

        // Fetch beds for this ward
        const allBeds = await db.collection("beds").find({ wardId }).toArray();
        const bedsSerialized = allBeds.map(
          (b) => serializeDoc(b) as Record<string, unknown>
        );

        // Separate patients by status
        const admittedPatients = patientsSerialized.filter(
          (p: Record<string, unknown>) => p.status === "admitted"
        );
        const queuedPatients = patientsSerialized.filter(
          (p: Record<string, unknown>) => p.status === "queued"
        );
        const dischargedPatients = patientsSerialized.filter(
          (p: Record<string, unknown>) => p.status === "discharged"
        );

        // Separate beds by status
        const availableBeds = bedsSerialized.filter(
          (b: Record<string, unknown>) => b.status === "available"
        ).length;
        const occupiedBeds = bedsSerialized.filter(
          (b: Record<string, unknown>) => b.status === "occupied"
        ).length;
        const maintenanceBeds = bedsSerialized.filter(
          (b: Record<string, unknown>) => b.status === "maintenance"
        ).length;

        // Format beds as Ward expects
        const formattedBeds: Bed[] = bedsSerialized.map(
          (bed: Record<string, unknown>) => ({
            id: (bed?.bedId as string) || (bed?._id as string) || "",
            bedNumber: (bed?.bedNumber as number) || 0,
            status:
              (bed?.status as "available" | "occupied" | "maintenance") ||
              "available",
            type: (bed?.type as "ICU" | "NORMAL") || "NORMAL",
            patient:
              bed?.patientId && admittedPatients.length > 0
                ? (admittedPatients.find(
                    (p: Record<string, unknown>) => p?.id === bed?.patientId
                  ) as unknown as Patient)
                : undefined,
          })
        );

        // Sort beds: ICU first (by bedNumber asc), then NORMAL (by bedNumber asc)
        formattedBeds.sort((a, b) => {
          const aPriority = a.type === "ICU" ? 0 : 1;
          const bPriority = b.type === "ICU" ? 0 : 1;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return (a.bedNumber || 0) - (b.bedNumber || 0);
        });

        return {
          id:
            (wardSerialized?._id as string) ||
            (wardSerialized?.wardId as string) ||
            "",
          wardId: (wardSerialized?.wardId as string) || "",
          name: (wardSerialized?.name as string) || "",
          beds: formattedBeds,
          patients: admittedPatients as unknown as Patient[],
          patientQueue: queuedPatients as unknown as Patient[],
          dischargedPatients: dischargedPatients as unknown as Patient[],
          totalBeds: bedsSerialized.length,
          occupiedBeds,
          availableBeds,
          maintenanceBeds,
        } as Ward;
      })
    );

    console.log(
      `✅ Server Action: Fetched ${wardsWithData.length} wards successfully`
    );
    return wardsWithData;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Server Action Error:", errorMsg);
    throw new Error(`Failed to fetch wards: ${errorMsg}`);
  }
}

export async function getWardWithPatients(
  wardId: string
): Promise<Ward | null> {
  if (!wardId) {
    return null;
  }

  const { db } = await connectToDatabase();

  let ward = await db.collection("wards").findOne({ wardId });

  if (!ward && ObjectId.isValid(wardId)) {
    ward = await db.collection("wards").findOne({
      _id: new ObjectId(wardId),
    });
  }

  if (!ward) {
    return null;
  }

  const wardSerialized = serializeDoc(ward) as Record<string, unknown>;
  const effectiveWardId = (wardSerialized?.wardId as string) || wardId;

  const allPatients = await db
    .collection("patients")
    .find({ wardId: effectiveWardId })
    .toArray();
  const patientsSerialized = allPatients.map(
    (p) => serializeDoc(p) as Record<string, unknown>
  );

  const allBeds = await db
    .collection("beds")
    .find({ wardId: effectiveWardId })
    .toArray();
  const bedsSerialized = allBeds.map(
    (b) => serializeDoc(b) as Record<string, unknown>
  );

  const admittedPatients = patientsSerialized.filter(
    (p: Record<string, unknown>) => p.status === "admitted"
  );
  const queuedPatients = patientsSerialized.filter(
    (p: Record<string, unknown>) => p.status === "queued"
  );
  const dischargedPatients = patientsSerialized.filter(
    (p: Record<string, unknown>) => p.status === "discharged"
  );

  const availableBeds = bedsSerialized.filter(
    (b: Record<string, unknown>) => b.status === "available"
  ).length;
  const occupiedBeds = bedsSerialized.filter(
    (b: Record<string, unknown>) => b.status === "occupied"
  ).length;
  const maintenanceBeds = bedsSerialized.filter(
    (b: Record<string, unknown>) => b.status === "maintenance"
  ).length;

  const formattedBeds: Bed[] = bedsSerialized.map(
    (bed: Record<string, unknown>) => ({
      id: (bed?.bedId as string) || (bed?._id as string) || "",
      bedNumber: (bed?.bedNumber as number) || 0,
      status:
        (bed?.status as "available" | "occupied" | "maintenance") ||
        "available",
      type: (bed?.type as "ICU" | "NORMAL") || "NORMAL",
      patient:
        bed?.patientId && admittedPatients.length > 0
          ? (admittedPatients.find(
              (p: Record<string, unknown>) => p?.id === bed?.patientId
            ) as unknown as Patient)
          : undefined,
    })
  );

  // Sort beds: ICU first then NORMAL; within each type sort by bedNumber ascending
  formattedBeds.sort((a, b) => {
    const aPriority = a.type === "ICU" ? 0 : 1;
    const bPriority = b.type === "ICU" ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (a.bedNumber || 0) - (b.bedNumber || 0);
  });

  const allWardDocs = await db.collection("wards").find({}).toArray();
  const wardSnapshots = await Promise.all(
    allWardDocs.map(async (wardDoc: Record<string, unknown>) => {
      const serialized = serializeDoc(wardDoc) as Record<string, unknown>;
      const wid = (serialized?.wardId as string) || "";

      if (!wid) {
        return {
          wardId: "",
          name: (serialized?.name as string) || "",
          occupiedBeds: 0,
          totalBeds: 0,
          queueLength: 0,
        };
      }

      const [bedsForWard, queuedCount] = await Promise.all([
        db.collection("beds").find({ wardId: wid }).toArray(),
        db
          .collection("patients")
          .countDocuments({ wardId: wid, status: "queued" }),
      ]);

      const serializedBeds = bedsForWard.map(
        (b) => serializeDoc(b) as Record<string, unknown>
      );

      return {
        wardId: wid,
        name: (serialized?.name as string) || wid,
        occupiedBeds: serializedBeds.filter((b) => b.status === "occupied")
          .length,
        totalBeds: serializedBeds.length,
        queueLength: queuedCount,
      };
    })
  );

  const queueResult = reorderQueueWithAi({
    targetWardId: effectiveWardId,
    targetWardName: (wardSerialized?.name as string) || effectiveWardId,
    targetWardQueue: queuedPatients as unknown as Patient[],
    targetWardOccupiedBeds: occupiedBeds,
    targetWardTotalBeds: bedsSerialized.length,
    wards: wardSnapshots.filter((w) => w.wardId),
  });

  const orderedQueue = queueResult.orderedPatients || [];
  const pendingTriagePatients = orderedQueue.filter(
    (patient) => Boolean(patient.triageRequested)
  );
  const remainingPatients = orderedQueue.filter(
    (patient) => !patient.triageRequested
  );

  return {
    id:
      (wardSerialized?._id as string) ||
      (wardSerialized?.wardId as string) ||
      "",
    wardId: (wardSerialized?.wardId as string) || "",
    name: (wardSerialized?.name as string) || "",
    beds: formattedBeds,
    patients: admittedPatients as unknown as Patient[],
    patientQueue: [...pendingTriagePatients, ...remainingPatients],
    dischargedPatients: dischargedPatients as unknown as Patient[],
    totalBeds: bedsSerialized.length,
    occupiedBeds,
    availableBeds,
    maintenanceBeds,
    queueOrderStrategy: queueResult.strategy,
    queueOrderMessage:
      pendingTriagePatients.length > 0
        ? `${queueResult.message} Pending doctor triage patients are pinned at the top.`
        : queueResult.message,
  } as Ward;
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
    await db.collection("wards").updateOne(
      { wardId: effectiveWardId },
      { $set: { updatedAt: new Date() } }
    );

    return { success: true, bedId: nextBedId };
  } catch (error) {
    console.error("❌ Error adding bed to ward:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}