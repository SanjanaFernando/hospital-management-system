import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse, NextRequest } from "next/server";
import { canManageStaff, getSessionFromHeaders } from "@/lib/rbac";
import { reorderQueueWithAi } from "@/lib/queueAi";

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromHeaders(request.headers);
    const { db } = await connectToDatabase();

    // Fetch all wards
    const wards = await db
      .collection("wards")
      .find(session.role === "admin" ? {} : { wardId: session.wardId })
      .toArray();

    // For each ward, fetch patients and organize by status
    const wardsWithPatients = await Promise.all(
      wards.map(async (ward: Record<string, unknown>) => {
        const wardId = ward?.wardId as string;

        // Fetch all patients for this ward
        const allPatients = await db
          .collection("patients")
          .find({ wardId })
          .toArray();

        // Separate into admitted and queued
        const admittedPatients = allPatients.filter(
          (p: Record<string, unknown>) => p.status === "admitted"
        );
        const queuedPatients = allPatients.filter(
          (p: Record<string, unknown>) => p.status === "queued"
        );
        const queueResult = reorderQueueWithAi({
          targetWardId: wardId,
          targetWardName: (ward?.name as string) || wardId,
          targetWardQueue: queuedPatients as unknown[],
          targetWardOccupiedBeds: 0,
          targetWardTotalBeds: 0,
          wards: [],
        });

        return {
          ...ward,
          patients: admittedPatients,
          patientQueue: queueResult.orderedPatients,
          totalPatients: allPatients.length,
        };
      })
    );

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
