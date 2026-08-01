"use server";

import { connectToDatabase } from "@/lib/mongodb";
import {
  UserSession,
  Notification,
  NotificationType,
  StaffRole,
} from "@/app/types";
import { normalizeSession } from "@/lib/rbac";

function generateId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createNotification(params: {
  type: NotificationType;
  title: string;
  message: string;
  wardId?: string;
  severity: "info" | "warning" | "critical";
  targetUserId?: string;
  targetRole?: StaffRole;
  deduplicateMinutes?: number;
}): Promise<void> {
  try {
    const { db } = await connectToDatabase();

    // Deduplication: skip if a similar notification was created recently
    if (params.deduplicateMinutes && params.deduplicateMinutes > 0) {
      const cutoff = new Date(
        Date.now() - params.deduplicateMinutes * 60 * 1000
      );
      const existing = await db.collection("notifications").findOne({
        type: params.type,
        wardId: params.wardId || null,
        createdAt: { $gte: cutoff },
      });
      if (existing) {
        return; // Skip duplicate
      }
    }

    const notification: Omit<Notification, "_id"> = {
      id: generateId(),
      type: params.type,
      title: params.title,
      message: params.message,
      wardId: params.wardId,
      severity: params.severity,
      isRead: false,
      readByUserIds: [],
      targetUserId: params.targetUserId,
      targetRole: params.targetRole,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };

    await db.collection("notifications").insertOne(notification);
  } catch (error) {
    // Notification creation should never break main operations
    console.error("Failed to create notification:", error);
  }
}

export async function getNotifications(
  actor: UserSession,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
    page?: number;
  }
): Promise<{ notifications: Notification[]; total: number }> {
  const session = normalizeSession(actor);
  const { db } = await connectToDatabase();
  const userId = session.userId || "guest";

  const limit = options?.limit || 20;
  const page = options?.page || 1;
  const skip = (page - 1) * limit;

  // Build filter
  const filter: Record<string, unknown> = {};

  if (session.role === "admin" || session.role === "sub_admin") {
    // Admins see everything
  } else {
    // Ward-scoped notifications for assigned wards only
    const wardIds =
      session.wardIds && session.wardIds.length > 0
        ? session.wardIds
        : session.wardId
          ? [session.wardId]
          : [];

    if (wardIds.length > 0) {
      filter.wardId = { $in: wardIds };
    } else {
      return { notifications: [], total: 0 };
    }
  }

  if (options?.unreadOnly) {
    filter.readByUserIds = { $ne: userId };
  }

  // Exclude expired notifications
  filter.$and = [
    {
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gte: new Date() } },
      ],
    },
  ];

  const [notifications, total] = await Promise.all([
    db
      .collection("notifications")
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection("notifications").countDocuments(filter),
  ]);

  return {
    notifications: notifications.map((doc) => ({
      _id: doc._id.toString(),
      id: doc.id as string,
      type: doc.type as NotificationType,
      title: doc.title as string,
      message: doc.message as string,
      wardId: doc.wardId as string | undefined,
      severity: doc.severity as "info" | "warning" | "critical",
      isRead: doc.readByUserIds?.includes(userId) || false,
      readByUserIds: doc.readByUserIds as string[] | undefined,
      targetUserId: doc.targetUserId as string | undefined,
      targetRole: doc.targetRole as StaffRole | undefined,
      createdAt: new Date(doc.createdAt as string | number | Date),
      expiresAt: doc.expiresAt
        ? new Date(doc.expiresAt as string | number | Date)
        : undefined,
    })),
    total,
  };
}

export async function markNotificationRead(
  notificationId: string,
  actor: UserSession
): Promise<void> {
  const session = normalizeSession(actor);
  const { db } = await connectToDatabase();
  const userId = session.userId || "guest";

  await db.collection("notifications").updateOne(
    { id: notificationId },
    {
      $addToSet: { readByUserIds: userId },
      $set: { updatedAt: new Date() },
    }
  );
}

export async function markAllNotificationsRead(
  actor: UserSession
): Promise<void> {
  const session = normalizeSession(actor);
  const { db } = await connectToDatabase();
  const userId = session.userId || "guest";

  // Build the same ward-scope filter as getNotifications (excluding already read ones)
  const filter: Record<string, unknown> = {
    readByUserIds: { $ne: userId },
  };

  if (session.role === "admin" || session.role === "sub_admin") {
    // Admin/Sub-admin see everything
  } else {
    const wardIds =
      session.wardIds && session.wardIds.length > 0
        ? session.wardIds
        : session.wardId
          ? [session.wardId]
          : [];

    if (wardIds.length > 0) {
      filter.wardId = { $in: wardIds };
    } else {
      return;
    }
  }

  await db.collection("notifications").updateMany(filter, {
    $addToSet: { readByUserIds: userId },
    $set: { updatedAt: new Date() },
  });
}

export async function getUnreadCount(actor: UserSession): Promise<number> {
  const session = normalizeSession(actor);
  const { db } = await connectToDatabase();
  const userId = session.userId || "guest";

  const filter: Record<string, unknown> = {
    readByUserIds: { $ne: userId },
  };

  if (session.role === "admin" || session.role === "sub_admin") {
    // Admin/Sub-admin see everything
  } else {
    const wardIds =
      session.wardIds && session.wardIds.length > 0
        ? session.wardIds
        : session.wardId
          ? [session.wardId]
          : [];

    if (wardIds.length > 0) {
      filter.wardId = { $in: wardIds };
    } else {
      return 0;
    }
  }

  // Exclude expired
  filter.$and = [
    {
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gte: new Date() } },
      ],
    },
  ];

  return await db.collection("notifications").countDocuments(filter);
}
