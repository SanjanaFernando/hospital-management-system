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

    const beds = await db.collection("beds").find(query).toArray();

    return NextResponse.json(beds, { status: 200 });
  } catch (error) {
    console.error("Error fetching beds:", error);
    return NextResponse.json(
      { error: "Failed to fetch beds" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const result = await db.collection("beds").insertOne({
      ...body,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating bed:", error);
    return NextResponse.json(
      { error: "Failed to create bed" },
      { status: 500 },
    );
  }
}
