"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function dischargePatientById(patientId: string): Promise<void> {
  if (!patientId) {
    throw new Error("Patient ID is required for discharge");
  }

  const { db } = await connectToDatabase();

  // Find patient by custom id first, fallback to _id
  let patient = await db.collection("patients").findOne({ id: patientId });

  if (!patient && ObjectId.isValid(patientId)) {
    patient = await db.collection("patients").findOne({
      _id: new ObjectId(patientId),
    });
  }

  if (!patient) {
    throw new Error("Patient not found");
  }

  const resolvedPatientId = patient.id || patientId;

  // Try deleting by custom patient id first
  let result = await db.collection("patients").deleteOne({
    id: resolvedPatientId,
  });

  // If not found and looks like an ObjectId, try deleting by _id
  if (result.deletedCount === 0 && ObjectId.isValid(patientId)) {
    result = await db.collection("patients").deleteOne({
      _id: new ObjectId(patientId),
    });
  }

  if (result.deletedCount === 0) {
    throw new Error("Patient not found");
  }

  // Free up the bed if this patient was admitted
  if (patient.status === "admitted") {
    await db.collection("beds").updateOne(
      { patientId: resolvedPatientId },
      {
        $set: {
          status: "available",
          patientId: null,
          updatedAt: new Date(),
        },
      },
    );
  }
}
