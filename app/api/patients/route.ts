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

    const query: Record<string, unknown> = {};
    if (session.role !== "admin") {
      query.wardId = session.wardId || "";
    } else if (wardId) {
      query.wardId = wardId;
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

    // Validate required fields
    if (!body.name || !body.age || !body.disease) {
      return NextResponse.json(
        { error: "Missing required fields: name, age, disease" },
        { status: 400 }
      );
    }

    if (!body.wardId) {
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

    const admissionTime = body.admissionTime
      ? new Date(body.admissionTime)
      : new Date();

    const result = await db.collection("patients").insertOne({
      ...body,
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
