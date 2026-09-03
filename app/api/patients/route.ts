import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse, NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  canAccessWard,
  canRegisterPatient,
  canSetTriage,
  getSessionFromHeaders,
} from "@/lib/rbac";

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromHeaders(request.headers);
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const wardId = searchParams.get("wardId");
    const searchTerm = searchParams.get("q")?.trim() || "";

    const query: Record<string, any> = {};
    if (wardId) {
      if (canAccessWard(session, wardId)) {
        query.wardId = wardId;
      } else {
        return NextResponse.json(
          { error: "Access denied to requested ward" },
          { status: 403 }
        );
      }
    } else if (session.role !== "admin") {
      const assigned = session.wardIds && session.wardIds.length > 0
        ? session.wardIds
        : (session.wardId ? [session.wardId] : []);
      query.wardId = { $in: assigned };
    }

    if (searchTerm) {
      query.$text = { $search: searchTerm };
    }

    const patients = await db
      .collection("patients")
      .find(query, {
        projection: {
          id: 1,
          name: 1,
          age: 1,
          ageGroup: 1,
          gender: 1,
          disease: 1,
          priority: 1,
          admissionTime: 1,
          dischargeTime: 1,
          queueWaitTime: 1,
          specialRequirements: 1,
          wardId: 1,
          assignedFromWardId: 1,
          status: 1,
          triageRequested: 1,
        },
      })
      .sort({ createdAt: -1, admissionTime: -1, name: 1 })
      .toArray();

    return NextResponse.json(patients, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching patients:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch patients", details: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromHeaders(request.headers);
    const { db } = await connectToDatabase();
    const body = await request.json();

    // Validate request body structure
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 }
      );
    }

    // Strict type, length, and content validation for name (Finding #4)
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 500
    ) {
      return NextResponse.json(
        { error: "Invalid patient name. Name must be a non-empty string under 500 characters." },
        { status: 400 }
      );
    }

    // Strict type and range validation for age (Finding #4)
    if (
      typeof body.age !== "number" ||
      Number.isNaN(body.age) ||
      !Number.isFinite(body.age) ||
      body.age < 0 ||
      body.age > 150
    ) {
      return NextResponse.json(
        { error: "Invalid patient age. Age must be a number between 0 and 150." },
        { status: 400 }
      );
    }

    // Strict type, length, and content validation for disease
    if (
      typeof body.disease !== "string" ||
      !body.disease.trim() ||
      body.disease.length > 500
    ) {
      return NextResponse.json(
        { error: "Invalid disease. Disease must be a non-empty string under 500 characters." },
        { status: 400 }
      );
    }

    if (typeof body.wardId !== "string" || !body.wardId.trim()) {
      return NextResponse.json(
        { error: "Ward ID is required" },
        { status: 400 }
      );
    }

    if (!canAccessWard(session, body.wardId)) {
      return NextResponse.json(
        { error: "You cannot register patients for this ward" },
        { status: 403 }
      );
    }

    if (!canRegisterPatient(session, body.wardId)) {
      return NextResponse.json(
        { error: "Your role cannot register patients" },
        { status: 403 }
      );
    }

    if (!canSetTriage(session, body.wardId)) {
      body.priority = "Triage 5";
      body.triageRequested = true;
    }

    const patientName = String(body.name || "").trim();
    let requestedId = String(body.id || "").trim();

    // Check for existing patient record (case-insensitive name match or matching ID)
    const existingPatient = await db.collection("patients").findOne({
      $or: [
        { name: { $regex: `^${patientName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, $options: "i" } },
        ...(requestedId ? [{ id: requestedId }] : []),
      ],
    });

    let patientId = requestedId;
    let accumulatedPreviousDiseases: string[] = Array.isArray(body.previousDiseases)
      ? body.previousDiseases.map(String)
      : body.previousDiseases
      ? [String(body.previousDiseases)]
      : [];

    if (existingPatient) {
      // Reuse existing numerical Patient ID
      const rawId = String(existingPatient.id || "");
      patientId = /^\d+$/.test(rawId)
        ? rawId
        : rawId.replace(/\D/g, "").slice(-6) || String(Math.floor(10000 + Math.random() * 90000));

      // Merge past diagnoses into previousDiseases
      const pastSet = new Set<string>();
      if (existingPatient.disease && existingPatient.disease !== body.disease) {
        pastSet.add(String(existingPatient.disease));
      }
      if (Array.isArray(existingPatient.previousDiseases)) {
        existingPatient.previousDiseases.forEach((d: any) => pastSet.add(String(d)));
      } else if (existingPatient.previousDiseases) {
        pastSet.add(String(existingPatient.previousDiseases));
      }
      accumulatedPreviousDiseases.forEach((d) => pastSet.add(d));
      accumulatedPreviousDiseases = Array.from(pastSet);
    } else if (!/^\d+$/.test(patientId)) {
      patientId = String(Math.floor(10000 + Math.random() * 90000));
    }

    const admissionTime = body.admissionTime
      ? new Date(body.admissionTime)
      : new Date();

    const normalizedGender =
      body.gender === "Female" || String(body.gender).toLowerCase() === "female"
        ? "Female"
        : "Male";

    const result = await db.collection("patients").insertOne({
      ...body,
      id: patientId,
      name: patientName || body.name,
      gender: normalizedGender,
      previousDiseases: accumulatedPreviousDiseases,
      admissionTime,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    revalidateTag("patients", "max");
    revalidateTag("dashboard", "max");
    revalidateTag("wards", "max");

    revalidatePath("/");
    revalidatePath(`/wards/${body.wardId}`);
    revalidatePath(`/wards/${body.wardId}/patients`);

    // Audit log for patient registration
    try {
      await db.collection("user_logs").insertOne({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        action: "patient_registered",
        actorName: session.displayName || "Unknown",
        actorRole: session.role,
        wardId: body.wardId,
        targetId: body.id || result.insertedId.toString(),
        targetName: body.name,
        details: `Registered patient in ${body.wardId} (${body.priority || "Triage 5"})`,
        timestamp: new Date(),
      });
    } catch {
      // Audit logging should never break main operations
    }

    return NextResponse.json(
      { success: true, insertedId: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating patient:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create patient", details: errorMessage },
      { status: 500 }
    );
  }
}
