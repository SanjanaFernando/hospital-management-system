import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse, NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    // Fetch all wards with their patients and queue
    const wards = await db.collection("wards").find({}).toArray();

    return NextResponse.json(wards, { status: 200 });
  } catch (error) {
    console.error("Error fetching wards:", error);
    return NextResponse.json(
      { error: "Failed to fetch wards" },
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

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating ward:", error);
    return NextResponse.json(
      { error: "Failed to create ward" },
      { status: 500 },
    );
  }
}
