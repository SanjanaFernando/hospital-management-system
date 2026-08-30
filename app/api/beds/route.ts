import { connectToDatabase } from "@/lib/mongodb";
import { NextResponse, NextRequest } from "next/server";
import {
  canAccessWard,
  canManageWardActions,
  getSessionFromHeaders,
} from "@/lib/rbac";

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromHeaders(request.headers);
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const wardId = searchParams.get("wardId");

    const query: Record<string, any> = {};
    if (wardId) {
      if (canAccessWard(session, wardId)) {
        query.wardId = wardId;
      } else {
        return NextResponse.json(
          { error: "Access denied to requested ward" },
          { status: 403 }
        );
      }
    } else if (session.role !== "admin") {
      const assigned = session.wardIds && session.wardIds.length > 0
        ? session.wardIds
        : (session.wardId ? [session.wardId] : []);
      query.wardId = { $in: assigned };
    }

    const beds = await db.collection("beds").find(query).toArray();

    return NextResponse.json(beds, { status: 200 });
  } catch (error) {
    console.error("Error fetching beds:", error);
    return NextResponse.json(
      { error: "Failed to fetch beds" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromHeaders(request.headers);
    const { db } = await connectToDatabase();
    const body = await request.json();

    if (!body.wardId) {
      return NextResponse.json(
        { error: "Ward ID is required" },
        { status: 400 }
      );
    }

    if (
      !canAccessWard(session, body.wardId) ||
      !canManageWardActions(session, body.wardId)
    ) {
      return NextResponse.json(
        { error: "You do not have permission to create beds in this ward" },
        { status: 403 }
      );
    }

    const result = await db.collection("beds").insertOne({
      ...body,
      gender: body.gender || "Unisex",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating bed:", error);
    return NextResponse.json(
      { error: "Failed to create bed" },
      { status: 500 }
    );
  }
}
