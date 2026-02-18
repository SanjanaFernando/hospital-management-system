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

  // Keep patient history and persist discharge time instead of deleting record
  let result = await db.collection("patients").updateOne(
    { id: resolvedPatientId },
    {
      $set: {
        status: "discharged",
        dischargeTime: new Date(),
        updatedAt: new Date(),
      },
      $unset: {
        admissionTime: "",
      },
    }
  );

  // If not found and looks like an ObjectId, try updating by _id
  if (result.matchedCount === 0 && ObjectId.isValid(patientId)) {
    result = await db.collection("patients").updateOne(
      { _id: new ObjectId(patientId) },
      {
        $set: {
          status: "discharged",
          dischargeTime: new Date(),
          updatedAt: new Date(),
        },
        $unset: {
          admissionTime: "",
        },
      }
    );
  }

  if (result.matchedCount === 0) {
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
      }
    );
  }
}

interface AssignPatientInput {
  wardId: string;
  bedId: string;
  patientId: string;
}

export async function assignPatientToBed(
  input: AssignPatientInput
): Promise<void> {
  const { wardId, bedId, patientId } = input;

  if (!wardId || !bedId || !patientId) {
    throw new Error("Ward ID, bed ID, and patient ID are required");
  }

  const { db } = await connectToDatabase();

  let bed = await db.collection("beds").findOne({ bedId, wardId });
  if (!bed) {
    bed = await db.collection("beds").findOne({ bedId });
  }
  if (!bed && ObjectId.isValid(bedId)) {
    bed = await db.collection("beds").findOne({ _id: new ObjectId(bedId) });
  }
  if (!bed) {
    throw new Error("Bed not found");
  }

  if (bed.status !== "available") {
    throw new Error("Selected bed is not available");
  }

  const effectiveWardId = (bed.wardId as string) || wardId;

  const patient = await db
    .collection("patients")
    .findOne({ id: patientId, wardId: effectiveWardId });

  if (!patient) {
    throw new Error("Patient not found in this ward queue");
  }

  if (patient.status !== "queued") {
    throw new Error("Selected patient is not in the queue");
  }

  await db.collection("beds").updateOne(
    { bedId: bed.bedId || bedId, wardId: effectiveWardId },
    {
      $set: {
        status: "occupied",
        patientId,
        updatedAt: new Date(),
      },
    }
  );

  await db.collection("patients").updateOne(
    { id: patientId, wardId: effectiveWardId },
    {
      $set: {
        status: "admitted",
        admissionTime: new Date(),
        updatedAt: new Date(),
      },
    }
  );
}

export async function movePatientToQueue(patientId: string): Promise<void> {
  if (!patientId) {
    throw new Error("Patient ID is required");
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

  // Update patient status to queued
  let result = await db.collection("patients").updateOne(
    { id: resolvedPatientId },
    {
      $set: {
        status: "queued",
        updatedAt: new Date(),
      },
      $unset: {
        admissionTime: "",
      },
    }
  );

  // If not found and looks like an ObjectId, try updating by _id
  if (result.matchedCount === 0 && ObjectId.isValid(patientId)) {
    result = await db.collection("patients").updateOne(
      { _id: new ObjectId(patientId) },
      {
        $set: {
          status: "queued",
          updatedAt: new Date(),
        },
        $unset: {
          admissionTime: "",
        },
      }
    );
  }

  if (result.matchedCount === 0) {
    throw new Error("Patient not found");
  }

  // Free up the bed
  await db.collection("beds").updateOne(
    { patientId: resolvedPatientId },
    {
      $set: {
        status: "available",
        patientId: null,
        updatedAt: new Date(),
      },
    }
  );
}

export async function forceAssignPatientToBed(
  input: AssignPatientInput
): Promise<void> {
  const { wardId, bedId, patientId } = input;

  if (!wardId || !bedId || !patientId) {
    throw new Error("Ward ID, bed ID, and patient ID are required");
  }

  const { db } = await connectToDatabase();

  // Find the bed
  let bed = await db.collection("beds").findOne({ bedId, wardId });
  if (!bed) {
    bed = await db.collection("beds").findOne({ bedId });
  }
  if (!bed && ObjectId.isValid(bedId)) {
    bed = await db.collection("beds").findOne({ _id: new ObjectId(bedId) });
  }
  if (!bed) {
    throw new Error("Bed not found");
  }

  if (bed.status === "maintenance") {
    throw new Error("Cannot assign patient to bed under maintenance");
  }

  const effectiveWardId = (bed.wardId as string) || wardId;

  // Find the new patient to assign
  const newPatient = await db
    .collection("patients")
    .findOne({ id: patientId, wardId: effectiveWardId });

  if (!newPatient) {
    throw new Error("Patient not found in this ward queue");
  }

  if (newPatient.status !== "queued") {
    throw new Error("Selected patient is not in the queue");
  }

  // If bed is occupied, move current patient back to queue
  if (bed.status === "occupied" && bed.patientId) {
    const currentPatient = await db
      .collection("patients")
      .findOne({ id: bed.patientId, wardId: effectiveWardId });

    if (currentPatient) {
      await db.collection("patients").updateOne(
        { id: bed.patientId, wardId: effectiveWardId },
        {
          $set: {
            status: "queued",
            updatedAt: new Date(),
          },
          $unset: {
            admissionTime: "",
          },
        }
      );
    }
  }

  // Assign new patient to bed
  await db.collection("beds").updateOne(
    { bedId: bed.bedId || bedId, wardId: effectiveWardId },
    {
      $set: {
        status: "occupied",
        patientId,
        updatedAt: new Date(),
      },
    }
  );

  await db.collection("patients").updateOne(
    { id: patientId, wardId: effectiveWardId },
    {
      $set: {
        status: "admitted",
        admissionTime: new Date(),
        updatedAt: new Date(),
      },
    }
  );
}
