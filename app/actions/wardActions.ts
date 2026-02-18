"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { Ward, Patient, Bed } from "@/app/types";
import { ObjectId } from "mongodb";

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
            patient:
              bed?.patientId && admittedPatients.length > 0
                ? (admittedPatients.find(
                    (p: Record<string, unknown>) => p?.id === bed?.patientId
                  ) as unknown as Patient)
                : undefined,
          })
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
      patient:
        bed?.patientId && admittedPatients.length > 0
          ? (admittedPatients.find(
              (p: Record<string, unknown>) => p?.id === bed?.patientId
            ) as unknown as Patient)
          : undefined,
    })
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
    patientQueue: queuedPatients as unknown as Patient[],
    dischargedPatients: dischargedPatients as unknown as Patient[],
    totalBeds: bedsSerialized.length,
    occupiedBeds,
    availableBeds,
    maintenanceBeds,
  } as Ward;
}

export async function updateBedStatus(
  bedId: string,
  newStatus: "available" | "occupied" | "maintenance"
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`📡 Server Action: Updating bed ${bedId} to ${newStatus}...`);
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

    const result = await db
      .collection("beds")
      .updateOne(query, { $set: { status: newStatus, updatedAt: new Date() } });

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
  wardId: string
): Promise<{ success: boolean; bedId?: string; error?: string }> {
  try {
    if (!wardId) {
      return { success: false, error: "Ward ID is required" };
    }

    const { db } = await connectToDatabase();

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

    const lastBed = await db
      .collection("beds")
      .find({ wardId: effectiveWardId })
      .sort({ bedNumber: -1 })
      .limit(1)
      .next();

    const lastBedDoc = lastBed
      ? (serializeDoc(lastBed) as Record<string, unknown>)
      : null;
    const nextBedNumber = ((lastBedDoc?.bedNumber as number) || 0) + 1;
    const nextBedId = `${effectiveWardId}-bed-${nextBedNumber}`;

    await db.collection("beds").insertOne({
      bedId: nextBedId,
      wardId: effectiveWardId,
      bedNumber: nextBedNumber,
      status: "available",
      patientId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db
      .collection("wards")
      .updateOne(
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
