"use server";

import { connectToDatabase } from "@/lib/mongodb";
import {
  UserSession,
  ChatMessage,
  ChatConversation,
  ChatUser,
  ChatRecipientType,
  StaffRole,
} from "@/app/types";
import { normalizeSession } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Derive a stable conversation ID for a 1-on-1 DM between two users */
function dmConvId(userA: string, userB: string): string {
  const sorted = [userA, userB].sort();
  return `dm-${sorted[0]}-${sorted[1]}`;
}

// ---------------------------------------------------------------------------
// Send a message (DM or broadcast)
// ---------------------------------------------------------------------------

export async function sendMessage(params: {
  actor: UserSession;
  content: string;
  recipientType: ChatRecipientType;
  /** Required when recipientType === 'user' */
  recipientId?: string;
  recipientName?: string;
  /** Required when recipientType === 'role' */
  recipientRole?: StaffRole;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = normalizeSession(params.actor);
    if (!session.userId) return { ok: false, error: "Not authenticated" };
    if (!params.content.trim()) return { ok: false, error: "Empty message" };

    const { db } = await connectToDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    let conversationId: string;
    let convType: "dm" | "broadcast";
    let participants: string[];
    let participantNames: Record<string, string>;
    let participantRoles: Record<string, StaffRole>;
    let unreadBy: string[];

    // Ensure sender display name is loaded from DB if missing or generic
    let senderName = session.displayName;
    if (!senderName || senderName === "Unknown") {
      const senderUser = await db
        .collection("users")
        .findOne({ userId: session.userId }, { projection: { displayName: 1 } });
      if (senderUser?.displayName) {
        senderName = senderUser.displayName as string;
      }
    }

    if (params.recipientType === "user") {
      if (!params.recipientId) return { ok: false, error: "recipientId required" };
      conversationId = dmConvId(session.userId, params.recipientId);
      convType = "dm";
      participants = [session.userId, params.recipientId];

      let recipientName = params.recipientName;
      let recipientRole: StaffRole | undefined = params.recipientRole;

      // Look up recipient details from users collection if missing or "Unknown"
      if (!recipientName || recipientName === "Unknown" || !recipientRole) {
        const recipientUser = await db
          .collection("users")
          .findOne(
            { userId: params.recipientId },
            { projection: { displayName: 1, role: 1 } }
          );
        if (recipientUser) {
          if (!recipientName || recipientName === "Unknown") {
            recipientName = recipientUser.displayName as string;
          }
          if (!recipientRole) {
            recipientRole = recipientUser.role as StaffRole;
          }
        }
      }

      // Check existing conversation record if recipient name is still missing
      if (!recipientName || recipientName === "Unknown") {
        const existingConv = await db
          .collection("chat_conversations")
          .findOne({ id: conversationId });
        if (
          existingConv?.participantNames?.[params.recipientId] &&
          existingConv.participantNames[params.recipientId] !== "Unknown"
        ) {
          recipientName = existingConv.participantNames[params.recipientId];
        }
      }

      participantNames = {
        [session.userId]: senderName || "Unknown",
        [params.recipientId]: recipientName || "Unknown",
      };
      participantRoles = {
        [session.userId]: session.role,
        [params.recipientId]: recipientRole || "consultant_doctor",
      };
      unreadBy = [params.recipientId];
    } else {
      conversationId = genId("bcast");
      convType = "broadcast";
      participants = [session.userId];
      participantNames = { [session.userId]: senderName || "Unknown" };
      participantRoles = { [session.userId]: session.role };
      unreadBy = []; // will be computed on read by checking role/all
    }

    const message: Omit<ChatMessage, "_id"> = {
      id: genId("msg"),
      conversationId,
      senderId: session.userId,
      senderName: senderName || "Unknown",
      senderRole: session.role,
      content: params.content.trim(),
      recipientType: params.recipientType,
      recipientId: params.recipientId,
      recipientRole: params.recipientRole,
      readBy: [session.userId],
      createdAt: now,
      expiresAt,
    };

    await db.collection("chat_messages").insertOne(message);

    // Upsert conversation record
    await db.collection("chat_conversations").updateOne(
      { id: conversationId },
      {
        $set: {
          id: conversationId,
          type: convType,
          participants,
          participantNames,
          participantRoles,
          lastMessage: params.content.trim().slice(0, 120),
          lastMessageAt: now,
          lastMessageBy: session.userId,
          recipientType: params.recipientType,
          recipientRole: params.recipientRole,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
        $addToSet: { unreadBy: { $each: unreadBy } },
      },
      { upsert: true }
    );

    return { ok: true };
  } catch (err: unknown) {
    console.error("sendMessage error:", err);
    return { ok: false, error: "Failed to send message" };
  }
}

// ---------------------------------------------------------------------------
// Fetch messages for a conversation
// ---------------------------------------------------------------------------

export async function getMessages(
  conversationId: string,
  actor: UserSession,
  options?: { limit?: number; before?: Date }
): Promise<ChatMessage[]> {
  try {
    const session = normalizeSession(actor);
    if (!session.userId) return [];

    const { db } = await connectToDatabase();
    const limit = options?.limit ?? 60;

    const filter: Record<string, unknown> = { conversationId };
    if (options?.before) {
      filter.createdAt = { $lt: options.before };
    }

    const docs = await db
      .collection("chat_messages")
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();

    // Resolve any "Unknown" sender names
    const missingSenderIds = new Set<string>();
    docs.forEach((d) => {
      if (!d.senderName || d.senderName === "Unknown") {
        if (d.senderId) missingSenderIds.add(d.senderId as string);
      }
    });

    const senderNameMap: Record<string, string> = {};
    if (missingSenderIds.size > 0) {
      const usersList = await db
        .collection("users")
        .find(
          { userId: { $in: Array.from(missingSenderIds) } },
          { projection: { userId: 1, displayName: 1 } }
        )
        .toArray();
      usersList.forEach((u) => {
        senderNameMap[u.userId as string] = u.displayName as string;
      });
    }

    return docs.map((d) => ({
      _id: d._id?.toString(),
      id: d.id as string,
      conversationId: d.conversationId as string,
      senderId: d.senderId as string,
      senderName:
        (!d.senderName || d.senderName === "Unknown")
          ? senderNameMap[d.senderId as string] || (d.senderName as string) || "Unknown"
          : (d.senderName as string),
      senderRole: d.senderRole as StaffRole,
      content: d.content as string,
      recipientType: d.recipientType as ChatRecipientType,
      recipientId: d.recipientId as string | undefined,
      recipientRole: d.recipientRole as StaffRole | undefined,
      readBy: (d.readBy as string[]) ?? [],
      createdAt: new Date(d.createdAt as string | number | Date),
      expiresAt: d.expiresAt
        ? new Date(d.expiresAt as string | number | Date)
        : undefined,
    }));
  } catch (err) {
    console.error("getMessages error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Get new messages since a timestamp (used for polling)
// ---------------------------------------------------------------------------

export async function getNewMessages(
  actor: UserSession,
  since: Date
): Promise<ChatMessage[]> {
  try {
    const session = normalizeSession(actor);
    if (!session.userId) return [];

    const { db } = await connectToDatabase();

    // Match messages relevant to this user:
    // 1) They are a participant in the conversation (DM)
    // 2) It's a broadcast to "all"
    // 3) It's a broadcast to their role
    const filter = {
      createdAt: { $gt: since },
      $or: [
        // DM where user is sender or recipient
        {
          recipientType: "user",
          $or: [
            { senderId: session.userId },
            { recipientId: session.userId },
          ],
        },
        // Broadcast to all
        { recipientType: "all" },
        // Broadcast to their role
        { recipientType: "role", recipientRole: session.role },
      ],
    };

    const docs = await db
      .collection("chat_messages")
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray();

    // Resolve any "Unknown" sender names
    const missingSenderIds = new Set<string>();
    docs.forEach((d) => {
      if (!d.senderName || d.senderName === "Unknown") {
        if (d.senderId) missingSenderIds.add(d.senderId as string);
      }
    });

    const senderNameMap: Record<string, string> = {};
    if (missingSenderIds.size > 0) {
      const usersList = await db
        .collection("users")
        .find(
          { userId: { $in: Array.from(missingSenderIds) } },
          { projection: { userId: 1, displayName: 1 } }
        )
        .toArray();
      usersList.forEach((u) => {
        senderNameMap[u.userId as string] = u.displayName as string;
      });
    }

    return docs.map((d) => ({
      _id: d._id?.toString(),
      id: d.id as string,
      conversationId: d.conversationId as string,
      senderId: d.senderId as string,
      senderName:
        (!d.senderName || d.senderName === "Unknown")
          ? senderNameMap[d.senderId as string] || (d.senderName as string) || "Unknown"
          : (d.senderName as string),
      senderRole: d.senderRole as StaffRole,
      content: d.content as string,
      recipientType: d.recipientType as ChatRecipientType,
      recipientId: d.recipientId as string | undefined,
      recipientRole: d.recipientRole as StaffRole | undefined,
      readBy: (d.readBy as string[]) ?? [],
      createdAt: new Date(d.createdAt as string | number | Date),
      expiresAt: d.expiresAt
        ? new Date(d.expiresAt as string | number | Date)
        : undefined,
    }));
  } catch (err) {
    console.error("getNewMessages error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// List conversations for the current user
// ---------------------------------------------------------------------------

export async function getConversations(
  actor: UserSession
): Promise<ChatConversation[]> {
  try {
    const session = normalizeSession(actor);
    if (!session.userId) return [];

    const { db } = await connectToDatabase();

    // DMs where user is a participant + all broadcasts relevant to them
    const filter = {
      $or: [
        { type: "dm", participants: session.userId },
        { type: "broadcast", recipientType: "all" },
        { type: "broadcast", recipientType: "role", recipientRole: session.role },
        { type: "broadcast", participants: session.userId }, // sender's own broadcasts
      ],
    };

    const docs = await db
      .collection("chat_conversations")
      .find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .toArray();

    // Identify any participant IDs with missing or "Unknown" names or missing roles
    const missingUserIds = new Set<string>();
    docs.forEach((d) => {
      if (d.type === "dm" && Array.isArray(d.participants)) {
        const names = (d.participantNames as Record<string, string>) || {};
        const roles = (d.participantRoles as Record<string, StaffRole>) || {};
        d.participants.forEach((pId: string) => {
          if (!names[pId] || names[pId] === "Unknown" || !roles[pId]) {
            missingUserIds.add(pId);
          }
        });
      }
    });

    const userMap: Record<string, { displayName: string; role: StaffRole }> = {};
    if (missingUserIds.size > 0) {
      const usersList = await db
        .collection("users")
        .find(
          { userId: { $in: Array.from(missingUserIds) } },
          { projection: { userId: 1, displayName: 1, role: 1 } }
        )
        .toArray();
      usersList.forEach((u) => {
        userMap[u.userId as string] = {
          displayName: u.displayName as string,
          role: u.role as StaffRole,
        };
      });
    }

    return docs.map((d) => {
      const pNames = { ...((d.participantNames as Record<string, string>) ?? {}) };
      const pRoles = { ...((d.participantRoles as Record<string, StaffRole>) ?? {}) };

      if (d.type === "dm" && Array.isArray(d.participants)) {
        d.participants.forEach((pId: string) => {
          if ((!pNames[pId] || pNames[pId] === "Unknown") && userMap[pId]?.displayName) {
            pNames[pId] = userMap[pId].displayName;
          }
          if (!pRoles[pId] && userMap[pId]?.role) {
            pRoles[pId] = userMap[pId].role;
          }
        });
      }

      return {
        _id: d._id?.toString(),
        id: d.id as string,
        type: d.type as "dm" | "broadcast",
        participants: (d.participants as string[]) ?? [],
        participantNames: pNames,
        participantRoles: pRoles,
        lastMessage: d.lastMessage as string,
        lastMessageAt: new Date(d.lastMessageAt as string | number | Date),
        lastMessageBy: d.lastMessageBy as string,
        recipientType: d.recipientType as ChatRecipientType | undefined,
        recipientRole: d.recipientRole as StaffRole | undefined,
        unreadBy: (d.unreadBy as string[]) ?? [],
        createdAt: new Date(d.createdAt as string | number | Date),
      };
    });
  } catch (err) {
    console.error("getConversations error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Mark conversation as read
// ---------------------------------------------------------------------------

export async function markConversationRead(
  conversationId: string,
  actor: UserSession
): Promise<void> {
  try {
    const session = normalizeSession(actor);
    if (!session.userId) return;

    const { db } = await connectToDatabase();

    // Remove user from unreadBy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.collection("chat_conversations") as any).updateOne(
      { id: conversationId },
      { $pull: { unreadBy: session.userId } }
    );

    // Mark all messages in this conversation as read by this user
    await db.collection("chat_messages").updateMany(
      { conversationId, readBy: { $ne: session.userId } },
      { $addToSet: { readBy: session.userId } }
    );
  } catch (err) {
    console.error("markConversationRead error:", err);
  }
}

// ---------------------------------------------------------------------------
// Get unread chat count for badge
// ---------------------------------------------------------------------------

export async function getUnreadChatCount(actor: UserSession): Promise<number> {
  try {
    const session = normalizeSession(actor);
    if (!session.userId) return 0;

    const { db } = await connectToDatabase();

    // Query all unread messages sent to this user or their role
    const unreadCount = await db.collection("chat_messages").countDocuments({
      senderId: { $ne: session.userId },
      readBy: { $ne: session.userId },
      $or: [
        { recipientId: session.userId },
        { recipientType: "all" },
        { recipientType: "role", recipientRole: session.role },
        { conversationId: { $regex: session.userId } },
      ],
    });

    return unreadCount;
  } catch (err) {
    console.error("getUnreadChatCount error:", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Get staff users list for recipient picker
// ---------------------------------------------------------------------------

export async function getChatUsers(actor: UserSession): Promise<ChatUser[]> {
  try {
    const session = normalizeSession(actor);
    if (!session.userId) return [];

    const { db } = await connectToDatabase();

    const docs = await db
      .collection("users")
      .find(
        { isActive: true, userId: { $ne: session.userId } },
        { projection: { userId: 1, displayName: 1, role: 1, _id: 0 } }
      )
      .sort({ displayName: 1 })
      .limit(200)
      .toArray();

    return docs.map((d) => ({
      userId: d.userId as string,
      displayName: d.displayName as string,
      role: d.role as StaffRole,
    }));
  } catch (err) {
    console.error("getChatUsers error:", err);
    return [];
  }
}
