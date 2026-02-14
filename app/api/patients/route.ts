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
    console.error("Error fetching patients:", error);
    return NextResponse.json(
      { error: "Failed to fetch patients" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const result = await db.collection("patients").insertOne({
      ...body,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating patient:", error);
    return NextResponse.json(
      { error: "Failed to create patient" },
      { status: 500 },
    );
  }
}
