import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse, NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    // Fetch all wards
    const wards = await db.collection("wards").find({}).toArray();

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
          (p: Record<string, unknown>) => p.status === "admitted",
        );
        const queuedPatients = allPatients.filter(
          (p: Record<string, unknown>) => p.status === "queued",
        );

        return {
          ...ward,
          patients: admittedPatients,
          patientQueue: queuedPatients,
          totalPatients: allPatients.length,
        };
      }),
    );

    return NextResponse.json(wardsWithPatients, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching wards:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch wards", details: errorMessage },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const result = await db.collection("wards").insertOne({
      ...body,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(
      { success: true, insertedId: result.insertedId },
      { status: 201 },
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating ward:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create ward", details: errorMessage },
      { status: 500 },
    );
  }
}
