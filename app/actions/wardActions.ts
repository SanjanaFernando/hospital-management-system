"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { Ward, Patient, Bed } from "@/app/types";

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
          (p) => serializeDoc(p) as Record<string, unknown>,
        );

        // Fetch beds for this ward
        const allBeds = await db.collection("beds").find({ wardId }).toArray();
        const bedsSerialized = allBeds.map(
          (b) => serializeDoc(b) as Record<string, unknown>,
        );

        // Separate patients by status
        const admittedPatients = patientsSerialized.filter(
          (p: Record<string, unknown>) => p.status === "admitted",
        );
        const queuedPatients = patientsSerialized.filter(
          (p: Record<string, unknown>) => p.status === "queued",
        );

        // Separate beds by status
        const availableBeds = bedsSerialized.filter(
          (b: Record<string, unknown>) => b.status === "available",
        ).length;
        const occupiedBeds = bedsSerialized.filter(
          (b: Record<string, unknown>) => b.status === "occupied",
        ).length;
        const maintenanceBeds = bedsSerialized.filter(
          (b: Record<string, unknown>) => b.status === "maintenance",
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
                    (p: Record<string, unknown>) => p?.id === bed?.patientId,
                  ) as unknown as Patient)
                : undefined,
          }),
        );

        return {
          id:
            (wardSerialized?._id as string) ||
            (wardSerialized?.wardId as string) ||
            "",
          name: (wardSerialized?.name as string) || "",
          beds: formattedBeds,
          patients: admittedPatients as unknown as Patient[],
          patientQueue: queuedPatients as unknown as Patient[],
          totalBeds: bedsSerialized.length,
          occupiedBeds,
          availableBeds,
          maintenanceBeds,
        } as Ward;
      }),
    );

    console.log(
      `✅ Server Action: Fetched ${wardsWithData.length} wards successfully`,
    );
    return wardsWithData;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Server Action Error:", errorMsg);
    throw new Error(`Failed to fetch wards: ${errorMsg}`);
  }
}
