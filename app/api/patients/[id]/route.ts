import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse, NextRequest } from "next/server";
import { ObjectId } from "mongodb";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    const patientId = params.id;

    const result = await db.collection("patients").updateOne(
      { _id: new ObjectId(patientId) },
      {
        $set: {
          ...body,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Patient updated successfully", result },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating patient:", error);
    return NextResponse.json(
      { error: "Failed to update patient" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { db } = await connectToDatabase();
    const patientId = params.id;

    const result = await db.collection("patients").deleteOne({
      _id: new ObjectId(patientId),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Patient deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting patient:", error);
    return NextResponse.json(
      { error: "Failed to delete patient" },
      { status: 500 },
    );
  }
}
