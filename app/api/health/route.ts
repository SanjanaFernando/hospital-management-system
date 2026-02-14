import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    console.log("Health check: Attempting to connect to MongoDB...");
    const { db } = await connectToDatabase();

    console.log("Health check: Connected to MongoDB");

    // Try to ping the database
    const result = await db.admin().ping();

    return NextResponse.json(
      {
        status: "healthy",
        message: "MongoDB connection successful",
        timestamp: new Date().toISOString(),
        ping: result,
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Health check failed:", errorMessage);

    return NextResponse.json(
      {
        status: "unhealthy",
        message: "MongoDB connection failed",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
