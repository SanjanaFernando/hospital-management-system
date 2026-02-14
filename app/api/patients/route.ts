import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse, NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const wardId = searchParams.get("wardId");

    const query: Record<string, string> = {};
    if (wardId) {
      query.wardId = wardId;
    }

    const patients = await db.collection("patients").find(query).toArray();

    return NextResponse.json(patients, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching patients:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch patients", details: errorMessage },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.age || !body.disease) {
      return NextResponse.json(
        { error: "Missing required fields: name, age, disease" },
        { status: 400 },
      );
    }

    const result = await db.collection("patients").insertOne({
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
    console.error("Error creating patient:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create patient", details: errorMessage },
      { status: 500 },
    );
  }
}
