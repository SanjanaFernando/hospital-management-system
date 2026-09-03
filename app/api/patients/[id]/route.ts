import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse, NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  canAssignOrDischargePatient,
  canSetTriage,
  getSessionFromHeaders,
} from "@/lib/rbac";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromHeaders(request.headers);
    const { db } = await connectToDatabase();
    const body = await request.json();
    const { id: patientId } = await params;

    const orClauses: Array<Record<string, unknown>> = [
      { id: patientId },
      { id: String(patientId) },
    ];
    if (!isNaN(Number(patientId))) {
      orClauses.push({ id: Number(patientId) });
    }
    if (ObjectId.isValid(patientId)) {
      orClauses.push({ _id: new ObjectId(patientId) });
    }
    const patientQuery = { $or: orClauses };

    const patient = await db.collection("patients").findOne(patientQuery);

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const wardId = (patient.wardId as string) || "";
    const isTriageOnlyUpdate =
      Object.prototype.hasOwnProperty.call(body, "priority") ||
      Object.prototype.hasOwnProperty.call(body, "triageRequested");

    if (isTriageOnlyUpdate) {
      if (!canSetTriage(session, wardId)) {
        return NextResponse.json(
          { error: "Only Consultant Doctor can set triage level" },
          { status: 403 }
        );
      }
    } else if (!canAssignOrDischargePatient(session, wardId)) {
      return NextResponse.json(
        { error: "You do not have permission to update this patient" },
        { status: 403 }
      );
    }

    const result = await db.collection("patients").updateOne(
      patientQuery,
      {
        $set: {
          ...body,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    revalidateTag("patients", "max");
    revalidateTag("beds", "max");
    revalidateTag("wards", "max");
    revalidateTag("dashboard", "max");
    revalidatePath("/wards", "layout");
    revalidatePath("/dashboard", "layout");

    return NextResponse.json(
      { message: "Patient updated successfully", result },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating patient:", error);
    return NextResponse.json(
      { error: "Failed to update patient" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromHeaders(request.headers);
    const { db } = await connectToDatabase();
    const { id: patientId } = await params;

    const orClauses: Array<Record<string, unknown>> = [
      { id: patientId },
      { id: String(patientId) },
    ];
    if (!isNaN(Number(patientId))) {
      orClauses.push({ id: Number(patientId) });
    }
    if (ObjectId.isValid(patientId)) {
      orClauses.push({ _id: new ObjectId(patientId) });
    }
    const patientQuery = { $or: orClauses };

    const patient = await db.collection("patients").findOne(patientQuery);

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const wardId = (patient.wardId as string) || "";
    if (!canAssignOrDischargePatient(session, wardId)) {
      return NextResponse.json(
        { error: "You do not have permission to delete this patient" },
        { status: 403 }
      );
    }

    const result = await db.collection("patients").deleteOne(patientQuery);

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    revalidateTag("patients", "max");
    revalidateTag("beds", "max");
    revalidateTag("wards", "max");
    revalidateTag("dashboard", "max");
    revalidatePath("/wards", "layout");
    revalidatePath("/dashboard", "layout");

    return NextResponse.json(
      { message: "Patient deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting patient:", error);
    return NextResponse.json(
      { error: "Failed to delete patient" },
      { status: 500 }
    );
  }
}
