"use server";

import { connectToDatabase } from "@/lib/mongodb";
import { UserSession, UserLog, LogAction } from "@/app/types";
import {
  assertPermission,
  canManageStaff,
  normalizeSession,
} from "@/lib/rbac";

function generateId(): string {
  // Use timestamp + random for unique IDs without external deps
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createUserLog(params: {
  action: LogAction;
  actor: UserSession;
  wardId?: string;
  targetId?: string;
  targetName?: string;
  details?: string;
}): Promise<void> {
  try {
    const { db } = await connectToDatabase();
    const session = normalizeSession(params.actor);

    const log: Omit<UserLog, "_id"> = {
      id: generateId(),
      action: params.action,
      actorName: session.displayName || "Unknown",
      actorRole: session.role,
      wardId: params.wardId || session.wardId,
      targetId: params.targetId,
      targetName: params.targetName,
      details: params.details,
      timestamp: new Date(),
    };

    await db.collection("user_logs").insertOne(log);
  } catch (error) {
    // Log silently — audit logging should never break main operations
    console.error("Failed to write user log:", error);
  }
}

export async function getUserLogs(
  actor: UserSession,
  options?: {
    page?: number;
    limit?: number;
    actionFilter?: LogAction;
    search?: string;
  }
): Promise<{ logs: UserLog[]; total: number }> {
  const session = normalizeSession(actor);

  assertPermission(
    canManageStaff(session),
    "Only admins can view user logs."
  );

  const { db } = await connectToDatabase();

  const page = options?.page || 1;
  const limit = options?.limit || 25;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};

  if (options?.actionFilter) {
    filter.action = options.actionFilter;
  }

  if (options?.search) {
    const searchRegex = { $regex: options.search, $options: "i" };
    filter.$or = [
      { actorName: searchRegex },
      { targetName: searchRegex },
      { details: searchRegex },
      { targetId: searchRegex },
    ];
  }

  const [logs, total] = await Promise.all([
    db
      .collection("user_logs")
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection("user_logs").countDocuments(filter),
  ]);

  return {
    logs: logs.map((doc) => ({
      _id: doc._id.toString(),
      id: doc.id as string,
      action: doc.action as LogAction,
      actorName: doc.actorName as string,
      actorRole: doc.actorRole as UserSession["role"],
      wardId: doc.wardId as string | undefined,
      targetId: doc.targetId as string | undefined,
      targetName: doc.targetName as string | undefined,
      details: doc.details as string | undefined,
      timestamp: new Date(doc.timestamp as string | number | Date),
    })),
    total,
  };
}
