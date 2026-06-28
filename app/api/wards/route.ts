import { connectToDatabase } from "@/lib/mongodb";
import { getWardsWithPatientsData } from "@/lib/hospital-data";
import { NextResponse, NextRequest } from "next/server";
import { canManageStaff, getSessionFromHeaders } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromHeaders(request.headers);
    const wardsWithPatients = await getWardsWithPatientsData();

    if (session.role !== "admin") {
      return NextResponse.json(
        wardsWithPatients.filter((ward) => ward.wardId === session.wardId),
        { status: 200 }
      );
    }

    return NextResponse.json(wardsWithPatients, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching wards:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch wards", details: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromHeaders(request.headers);
    if (!canManageStaff(session)) {
      return NextResponse.json(
        { error: "Only Admin can create wards" },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const body = await request.json();

    const result = await db.collection("wards").insertOne({
      ...body,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(
      { success: true, insertedId: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating ward:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create ward", details: errorMessage },
      { status: 500 }
    );
  }
}
