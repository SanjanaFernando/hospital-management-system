"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { revalidateTag } from "next/cache";
import { UserSession } from "@/app/types";
import {
  assertPermission,
  canAssignOrDischargePatient,
  canAssignQueuedPatientAcrossWards,
  normalizeSession,
  normalizeWardId,
} from "@/lib/rbac";
import { createUserLog } from "@/app/actions/logActions";
import { createNotification } from "@/app/actions/notificationActions";

export async function dischargePatientById(
  patientId: string,
  actor: UserSession
): Promise<void> {
  if (!patientId) {
    throw new Error("Patient ID is required for discharge");
  }

  const session = normalizeSession(actor);
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

  const patientWardId = (patient.wardId as string) || "";
  assertPermission(
    canAssignOrDischargePatient(session, patientWardId),
    "You do not have permission to discharge this patient."
  );

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
        assignedFromWardId: "",
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
          assignedFromWardId: "",
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

  revalidateTag("patients", "max");
  revalidateTag("beds", "max");
  revalidateTag("wards", "max");
  revalidateTag("dashboard", "max");

  await createUserLog({
    action: "patient_discharged",
    actor,
    wardId: patientWardId,
    targetId: resolvedPatientId,
    targetName: (patient.name as string) || resolvedPatientId,
    details: `Discharged patient from ${patientWardId}`,
  });

  await createNotification({
    type: "patient_discharged",
    title: "Patient Discharged",
    message: `${(patient.name as string) || resolvedPatientId} has been discharged from ${patientWardId}`,
    wardId: patientWardId,
    severity: "info",
  });
}

interface AssignPatientInput {
  wardId: string;
  sourceWardId?: string;
  bedId: string;
  patientId: string;
  actor: UserSession;
}

export async function assignPatientToBed(
  input: AssignPatientInput
): Promise<void> {
  const { wardId, sourceWardId, bedId, patientId } = input;

  if (!wardId || !bedId || !patientId) {
    throw new Error("Ward ID, bed ID, and patient ID are required");
  }

  const { db } = await connectToDatabase();
  const session = normalizeSession(input.actor);

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
  const normalizedSourceWardId = normalizeWardId(sourceWardId || wardId);

  if (normalizedSourceWardId && normalizedSourceWardId !== effectiveWardId) {
    assertPermission(
      canAssignQueuedPatientAcrossWards(
        session,
        normalizedSourceWardId,
        effectiveWardId
      ),
      "You do not have permission to assign this queued patient to another ward."
    );
  } else {
    assertPermission(
      canAssignOrDischargePatient(session, effectiveWardId),
      "You do not have permission to assign a patient in this ward."
    );
  }

  const patientQuery: Record<string, unknown> = { id: patientId };
  if (normalizedSourceWardId) {
    patientQuery.wardId = normalizedSourceWardId;
  }

  let patient = await db.collection("patients").findOne(patientQuery);

  if (!patient && ObjectId.isValid(patientId)) {
    const objectIdQuery: Record<string, unknown> = {
      _id: new ObjectId(patientId),
    };

    if (normalizedSourceWardId) {
      objectIdQuery.wardId = normalizedSourceWardId;
    }

    patient = await db.collection("patients").findOne(objectIdQuery);
  }

  if (!patient) {
    throw new Error("Patient not found in this ward queue");
  }

  if (patient.status !== "queued") {
    throw new Error("Selected patient is not in the queue");
  }

  const patientWardFilter = normalizedSourceWardId || effectiveWardId;

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
    { id: patientId, wardId: patientWardFilter },
    {
      $set: {
        status: "admitted",
        wardId: effectiveWardId,
        assignedFromWardId:
          normalizedSourceWardId && normalizedSourceWardId !== effectiveWardId
            ? normalizedSourceWardId
            : null,
        admissionTime: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  revalidateTag("patients", "max");
  revalidateTag("beds", "max");
  revalidateTag("wards", "max");
  revalidateTag("dashboard", "max");

  await createUserLog({
    action: "patient_assigned_bed",
    actor: input.actor,
    wardId: effectiveWardId,
    targetId: patientId,
    targetName: (patient.name as string) || patientId,
    details: `Assigned to bed ${bedId} in ${effectiveWardId}`,
  });

  await createNotification({
    type: "patient_assigned_bed",
    title: "Patient Assigned to Bed",
    message: `${(patient.name as string) || patientId} assigned to bed ${bedId} in ${effectiveWardId}`,
    wardId: effectiveWardId,
    severity: "info",
  });
}

export async function movePatientToQueue(
  patientId: string,
  actor: UserSession
): Promise<void> {
  if (!patientId) {
    throw new Error("Patient ID is required");
  }

  const session = normalizeSession(actor);
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

  const patientWardId = (patient.wardId as string) || "";
  assertPermission(
    canAssignOrDischargePatient(session, patientWardId),
    "You do not have permission to move this patient to queue."
  );

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
        assignedFromWardId: "",
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
          assignedFromWardId: "",
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

  revalidateTag("patients", "max");
  revalidateTag("beds", "max");
  revalidateTag("wards", "max");
  revalidateTag("dashboard", "max");

  await createUserLog({
    action: "patient_moved_to_queue",
    actor,
    wardId: patientWardId,
    targetId: resolvedPatientId,
    targetName: (patient.name as string) || resolvedPatientId,
    details: `Moved patient back to queue in ${patientWardId}`,
  });
}

export async function forceAssignPatientToBed(
  input: AssignPatientInput
): Promise<void> {
  const { wardId, sourceWardId, bedId, patientId } = input;

  if (!wardId || !bedId || !patientId) {
    throw new Error("Ward ID, bed ID, and patient ID are required");
  }

  const { db } = await connectToDatabase();
  const session = normalizeSession(input.actor);

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
  const normalizedSourceWardId = normalizeWardId(sourceWardId || wardId);

  if (normalizedSourceWardId && normalizedSourceWardId !== effectiveWardId) {
    assertPermission(
      canAssignQueuedPatientAcrossWards(
        session,
        normalizedSourceWardId,
        effectiveWardId
      ),
      "You do not have permission to force assign this queued patient to another ward."
    );
  } else {
    assertPermission(
      canAssignOrDischargePatient(session, effectiveWardId),
      "You do not have permission to force assign in this ward."
    );
  }

  // Find the new patient to assign
  const patientQuery: Record<string, unknown> = { id: patientId };
  if (normalizedSourceWardId) {
    patientQuery.wardId = normalizedSourceWardId;
  }

  let newPatient = await db.collection("patients").findOne(patientQuery);

  if (!newPatient && ObjectId.isValid(patientId)) {
    const objectIdQuery: Record<string, unknown> = {
      _id: new ObjectId(patientId),
    };

    if (normalizedSourceWardId) {
      objectIdQuery.wardId = normalizedSourceWardId;
    }

    newPatient = await db.collection("patients").findOne(objectIdQuery);
  }

  if (!newPatient) {
    throw new Error("Patient not found in this ward queue");
  }

  if (newPatient.status !== "queued") {
    throw new Error("Selected patient is not in the queue");
  }

  const patientWardFilter = normalizedSourceWardId || effectiveWardId;

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
    { id: patientId, wardId: patientWardFilter },
    {
      $set: {
        status: "admitted",
        wardId: effectiveWardId,
        assignedFromWardId:
          normalizedSourceWardId && normalizedSourceWardId !== effectiveWardId
            ? normalizedSourceWardId
            : null,
        admissionTime: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  revalidateTag("patients", "max");
  revalidateTag("beds", "max");
  revalidateTag("wards", "max");
  revalidateTag("dashboard", "max");

  await createUserLog({
    action: "patient_force_assigned",
    actor: input.actor,
    wardId: effectiveWardId,
    targetId: patientId,
    targetName: (newPatient.name as string) || patientId,
    details: `Force assigned to bed ${bedId} in ${effectiveWardId}`,
  });

  await createNotification({
    type: "patient_assigned_bed",
    title: "Patient Force-Assigned",
    message: `${(newPatient.name as string) || patientId} force-assigned to bed ${bedId} in ${effectiveWardId}`,
    wardId: effectiveWardId,
    severity: "warning",
  });
}

export interface ExistingPatientSearchResult {
  id: string;
  name: string;
  age: number;
  gender?: string;
  disease: string;
  previousDiseases: string[];
  status?: string;
}

export async function searchExistingPatients(
  query: string
): Promise<ExistingPatientSearchResult[]> {
  if (!query || query.trim().length < 1) return [];

  const { db } = await connectToDatabase();
  const q = query.trim();

  // Search by name or numerical id
  const docs = await db
    .collection("patients")
    .find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { id: { $regex: q, $options: "i" } },
      ],
    })
    .sort({ updatedAt: -1 })
    .limit(10)
    .toArray();

  const map = new Map<string, ExistingPatientSearchResult>();

  for (const doc of docs) {
    const rawId = String(doc.id || doc._id || "");
    const numericId = /^\d+$/.test(rawId)
      ? rawId
      : rawId.replace(/\D/g, "").slice(-6) || String(10000 + Math.floor(Math.random() * 90000));

    const nameKey = String(doc.name || "").trim().toLowerCase();
    if (!map.has(nameKey)) {
      const pastDiseases = new Set<string>();
      if (doc.disease) pastDiseases.add(String(doc.disease));
      if (Array.isArray(doc.previousDiseases)) {
        doc.previousDiseases.forEach((d: any) => pastDiseases.add(String(d)));
      } else if (doc.previousDiseases) {
        pastDiseases.add(String(doc.previousDiseases));
      }

      map.set(nameKey, {
        id: numericId,
        name: String(doc.name || ""),
        age: Number(doc.age || 0),
        gender: doc.gender ? String(doc.gender) : undefined,
        disease: String(doc.disease || ""),
        previousDiseases: Array.from(pastDiseases),
        status: doc.status ? String(doc.status) : undefined,
      });
    }
  }

  return Array.from(map.values());
}
