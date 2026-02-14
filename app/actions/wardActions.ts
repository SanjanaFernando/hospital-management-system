"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { Ward, Patient, Bed } from "@/app/types";

export async function getWardsWithPatients(): Promise<Ward[]> {
  try {
    console.log("📡 Server Action: Fetching wards with patients...");
    const { db } = await connectToDatabase();

    // Fetch all wards
    const wards = await db.collection("wards").find({}).toArray();

    // For each ward, fetch patients and beds
    const wardsWithData = await Promise.all(
      wards.map(async (ward: Record<string, unknown>) => {
        const wardId = ward?.wardId as string;

        // Fetch patients for this ward
        const allPatients = await db
          .collection("patients")
          .find({ wardId })
          .toArray();

        // Fetch beds for this ward
        const allBeds = await db.collection("beds").find({ wardId }).toArray();

        // Separate patients by status
        const admittedPatients = allPatients.filter(
          (p: Record<string, unknown>) => p.status === "admitted",
        );
        const queuedPatients = allPatients.filter(
          (p: Record<string, unknown>) => p.status === "queued",
        );

        // Separate beds by status
        const availableBeds = allBeds.filter(
          (b: Record<string, unknown>) => b.status === "available",
        ).length;
        const occupiedBeds = allBeds.filter(
          (b: Record<string, unknown>) => b.status === "occupied",
        ).length;
        const maintenanceBeds = allBeds.filter(
          (b: Record<string, unknown>) => b.status === "maintenance",
        ).length;

        // Format beds as Ward expects
        const formattedBeds: Bed[] = allBeds.map(
          (bed: Record<string, unknown>) => ({
            id: (bed?.bedId as string) || String(bed?._id),
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
          id: (ward?._id as string) || (ward?.wardId as string),
          name: (ward?.name as string) || "",
          beds: formattedBeds,
          patients: admittedPatients as unknown as Patient[],
          patientQueue: queuedPatients as unknown as Patient[],
          totalBeds: allBeds.length,
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
