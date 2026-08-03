"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  startTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  MessageCircle,
  X,
  Send,
  Radio,
  ChevronLeft,
  Users,
  UserRound,
  Search,
  CheckCheck,
  Loader,
} from "lucide-react";
import {
  ChatConversation,
  ChatMessage,
  ChatUser,
  ChatRecipientType,
  StaffRole,
  UserSession,
} from "@/app/types";
import {
  sendMessage,
  getConversations,
  getMessages,
  getNewMessages,
  markConversationRead,
  getUnreadChatCount,
  getChatUsers,
} from "@/app/actions/chatActions";
import { ROLE_LABELS } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString();
}

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const ROLE_COLOR: Record<StaffRole, string> = {
  admin: "bg-purple-500",
  sub_admin: "bg-indigo-500",
  consultant_doctor: "bg-teal-500",
  main_sister: "bg-pink-500",
  main_attendant: "bg-amber-500",
};

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({
  name,
  role,
  size = "sm",
}: {
  name: string;
  role: StaffRole;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-sm";
  return (
    <div
      className={`${sz} ${ROLE_COLOR[role] ?? "bg-slate-500"} flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
    >
      {getInitials(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConversationItem
// ---------------------------------------------------------------------------

function ConversationItem({
  conv,
  myUserId,
  isActive,
  onClick,
}: {
  conv: ChatConversation;
  myUserId: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const isBroadcast = conv.type === "broadcast";
  const otherUserId = conv.participants.find((p) => p !== myUserId) ?? "";
  const displayName = isBroadcast
    ? "📢 Broadcast"
    : conv.participantNames[otherUserId] ?? "Unknown";
  const senderName = conv.participantNames[conv.lastMessageBy] ?? "Someone";
  const hasUnread = conv.unreadBy.includes(myUserId);
  const otherUserRole = conv.participantRoles?.[otherUserId] ?? "consultant_doctor";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
        isActive
          ? "bg-teal-500/20 ring-1 ring-teal-400/30"
          : "hover:bg-white/8"
      }`}
    >
      {isBroadcast ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30">
          <Radio className="h-4 w-4" />
        </div>
      ) : (
        <div className="relative">
          <Avatar
            name={displayName}
            role={otherUserRole}
            size="sm"
          />
          {hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-teal-400 ring-2 ring-[#0b2b33]" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p
            className={`truncate text-sm font-semibold ${hasUnread && !isBroadcast ? "text-white" : "text-slate-200"}`}
          >
            {displayName}
          </p>
          <span className="shrink-0 text-[10px] text-slate-500">
            {formatTime(conv.lastMessageAt)}
          </span>
        </div>
        <p className="truncate text-xs text-slate-400">
          {conv.lastMessageBy === myUserId ? "You" : senderName}:{" "}
          {conv.lastMessage}
        </p>
      </div>
      {hasUnread && !isBroadcast && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-400 text-[9px] font-bold text-slate-900">
          !
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function MessageBubble({
  msg,
  isOwn,
}: {
  msg: ChatMessage;
  isOwn: boolean;
}) {
  return (
    <div className={`flex gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${ROLE_COLOR[msg.senderRole] ?? "bg-slate-500"}`}
      >
        {getInitials(msg.senderName)}
      </div>
      <div
        className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-0.5`}
      >
        {!isOwn && (
          <span className="px-1 text-[10px] text-slate-400">
            {msg.senderName} · {ROLE_LABELS[msg.senderRole]}
          </span>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            isOwn
              ? "rounded-tr-sm bg-teal-500 text-white"
              : "rounded-tl-sm bg-white/10 text-slate-100 ring-1 ring-white/10"
          }`}
        >
          {msg.content}
        </div>
        <span className="px-1 text-[10px] text-slate-500">
          {formatMessageTime(msg.createdAt)}
          {isOwn && (
            <CheckCheck
              className={`ml-1 inline h-3 w-3 ${msg.readBy.length > 1 ? "text-teal-300" : "text-slate-500"}`}
            />
          )}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewConversationPanel
// ---------------------------------------------------------------------------

function NewConversationPanel({
  users,
  myUserId,
  onSelectUser,
  onBroadcast,
  onClose,
}: {
  users: ChatUser[];
  myUserId: string;
  onSelectUser: (user: ChatUser) => void;
  onBroadcast: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = users.filter(
    (u) =>
      u.userId !== myUserId &&
      (u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        ROLE_LABELS[u.role]?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="flex-1 text-sm font-semibold text-white">
          New Message
        </h3>
      </div>

      {/* Broadcast CTA */}
      <div className="px-4 pt-3">
        <button
          onClick={onBroadcast}
          className="flex w-full items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-left transition hover:bg-amber-500/20"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-300">
              Broadcast Message
            </p>
            <p className="text-xs text-slate-400">Send to all or by role</p>
          </div>
        </button>
      </div>

      <div className="px-4 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Direct Message
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
          />
        </div>
      </div>

      <div className="mt-2 flex-1 space-y-1 overflow-y-auto px-4 pb-3 custom-scrollbar">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No staff found
          </p>
        ) : (
          filtered.map((u) => (
            <button
              key={u.userId}
              onClick={() => onSelectUser(u)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/8"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${ROLE_COLOR[u.role] ?? "bg-slate-500"}`}
              >
                {getInitials(u.displayName)}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-100">
                  {u.displayName}
                </p>
                <p className="text-xs text-slate-400">
                  {ROLE_LABELS[u.role]}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BroadcastComposer
// ---------------------------------------------------------------------------

function BroadcastComposer({
  session,
  users,
  onSent,
  onBack,
}: {
  session: UserSession;
  users: ChatUser[];
  onSent: () => void;
  onBack: () => void;
}) {
  const [targetType, setTargetType] = useState<"all" | "role">("all");
  const [targetRole, setTargetRole] = useState<StaffRole>("consultant_doctor");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const roles: StaffRole[] = [
    "consultant_doctor",
    "main_sister",
    "main_attendant",
    "sub_admin",
    "admin",
  ];

  const handleSend = async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    const result = await sendMessage({
      actor: session,
      content,
      recipientType: targetType === "all" ? "all" : "role",
      recipientRole: targetType === "role" ? targetRole : undefined,
    });
    setSending(false);
    if (result.ok) {
      onSent();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
          <Radio className="h-4 w-4" />
        </div>
        <h3 className="flex-1 text-sm font-semibold text-white">
          Broadcast Message
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Audience selector */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Send To
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTargetType("all")}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                targetType === "all"
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <Users className="h-4 w-4" />
              All Staff
            </button>
            <button
              onClick={() => setTargetType("role")}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                targetType === "role"
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <UserRound className="h-4 w-4" />
              By Role
            </button>
          </div>
        </div>

        {targetType === "role" && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Select Role
            </p>
            <div className="space-y-1.5">
              {roles.map((r) => (
                <button
                  key={r}
                  onClick={() => setTargetRole(r)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    targetRole === r
                      ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${ROLE_COLOR[r] ?? "bg-slate-500"}`}
                  />
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Message
          </p>
          <textarea
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your broadcast message..."
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
          />
        </div>
      </div>

      <div className="border-t border-white/10 p-4">
        <button
          onClick={() => startTransition(() => { void handleSend(); })}
          disabled={!content.trim() || sending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <Radio className="h-4 w-4" />
          )}
          {sending ? "Sending…" : "Send Broadcast"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageThread
// ---------------------------------------------------------------------------

function MessageThread({
  conv,
  session,
  onBack,
}: {
  conv: ChatConversation;
  session: UserSession;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastPollRef = useRef<Date>(new Date());
  const myId = session.userId ?? "";

  const isBroadcast = conv.type === "broadcast";
  const otherUserId = conv.participants.find((p) => p !== myId) ?? "";
  const displayName = isBroadcast
    ? `📢 Broadcast · ${
        conv.recipientType === "all"
          ? "All Staff"
          : conv.recipientRole
            ? ROLE_LABELS[conv.recipientRole] ?? conv.recipientRole
            : "Unknown"
      }`
    : conv.participantNames[otherUserId] ?? "Unknown";
  const otherUserRole = conv.participantRoles?.[otherUserId] ?? "consultant_doctor";

  // Initial load
  useEffect(() => {
    setLoading(true);
    void getMessages(conv.id, session).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
      lastPollRef.current = new Date();
      // mark read
      startTransition(() => { void markConversationRead(conv.id, session); });
    });
  }, [conv.id]);

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(async () => {
      const newer = await getNewMessages(session, lastPollRef.current);
      if (newer.length > 0) {
        lastPollRef.current = new Date();
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = newer.filter(
            (m) => !existingIds.has(m.id) && m.conversationId === conv.id
          );
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [conv.id, session]);

  // Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");

    // Optimistic message
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      conversationId: conv.id,
      senderId: myId,
      senderName: session.displayName ?? "Me",
      senderRole: session.role,
      content: text,
      recipientType: conv.recipientType ?? "user",
      recipientId: otherUserId || undefined,
      recipientRole: conv.recipientRole,
      readBy: [myId],
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, optimistic]);

    await sendMessage({
      actor: session,
      content: text,
      recipientType: conv.recipientType ?? "user",
      recipientId: isBroadcast ? undefined : otherUserId,
      recipientName: isBroadcast ? undefined : conv.participantNames[otherUserId],
      recipientRole: conv.recipientRole,
    });

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      startTransition(() => { void handleSend(); });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Thread header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {isBroadcast ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            <Radio className="h-4 w-4" />
          </div>
        ) : (
          <Avatar name={displayName} role={otherUserRole} size="sm" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {displayName}
          </p>
          {!isBroadcast && (
            <p className="text-[10px] text-slate-400">
              {ROLE_LABELS[otherUserRole] ?? otherUserRole}
            </p>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-6 w-6 animate-spin text-teal-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm text-slate-400">No messages yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Send the first message!
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.senderId === myId}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area — hide for received broadcast threads */}
      {(!isBroadcast || conv.participants.includes(myId)) && (
        <div className="border-t border-white/10 p-3">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isBroadcast ? "Reply to broadcast…" : "Type a message…"
              }
              className="flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
              style={{ maxHeight: "80px", overflowY: "auto" }}
            />
            <button
              onClick={() => startTransition(() => { void handleSend(); })}
              disabled={!input.trim() || sending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-slate-600">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel — conversation list + thread view
// ---------------------------------------------------------------------------

type ChatView =
  | { type: "list" }
  | { type: "new" }
  | { type: "broadcast" }
  | { type: "thread"; conv: ChatConversation };

function ChatPanel({
  session,
  onUnreadChange,
}: {
  session: UserSession;
  onUnreadChange: (count: number) => void;
}) {
  const [view, setView] = useState<ChatView>({ type: "list" });
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const myId = session.userId ?? "";

  const refreshConvs = useCallback(async () => {
    const [convs, cnt] = await Promise.all([
      getConversations(session),
      getUnreadChatCount(session),
    ]);
    setConversations(convs);
    onUnreadChange(cnt);
  }, [session, onUnreadChange]);

  // Initial load
  useEffect(() => {
    setLoadingConvs(true);
    void Promise.all([refreshConvs(), getChatUsers(session).then(setUsers)]).then(
      () => setLoadingConvs(false)
    );
  }, []);

  // Poll conversations every 8s
  useEffect(() => {
    const interval = setInterval(() => { void refreshConvs(); }, 8000);
    return () => clearInterval(interval);
  }, [refreshConvs]);

  const handleSelectUser = (user: ChatUser) => {
    // Derive DM conversation id
    const dmId = [myId, user.userId].sort().join("-");
    const pseudoConv: ChatConversation = {
      id: `dm-${dmId}`,
      type: "dm",
      participants: [myId, user.userId],
      participantNames: {
        [myId]: session.displayName ?? "Me",
        [user.userId]: user.displayName,
      },
      participantRoles: {
        [myId]: session.role,
        [user.userId]: user.role,
      },
      lastMessage: "",
      lastMessageAt: new Date(),
      lastMessageBy: myId,
      recipientType: "user",
      unreadBy: [],
      createdAt: new Date(),
    };
    // Check if conversation already exists
    const existing = conversations.find((c) => c.id === `dm-${dmId}`);
    setView({ type: "thread", conv: existing ?? pseudoConv });
  };

  const handleBroadcastSent = () => {
    void refreshConvs();
    setView({ type: "list" });
  };

  if (view.type === "new") {
    return (
      <NewConversationPanel
        users={users}
        myUserId={myId}
        onSelectUser={handleSelectUser}
        onBroadcast={() => setView({ type: "broadcast" })}
        onClose={() => setView({ type: "list" })}
      />
    );
  }

  if (view.type === "broadcast") {
    return (
      <BroadcastComposer
        session={session}
        users={users}
        onSent={handleBroadcastSent}
        onBack={() => setView({ type: "new" })}
      />
    );
  }

  if (view.type === "thread") {
    return (
      <MessageThread
        conv={view.conv}
        session={session}
        onBack={() => {
          void refreshConvs();
          setView({ type: "list" });
        }}
      />
    );
  }

  // Default: conversation list (view.type === "list" at this point)
  const activeConvId: string | null = null;
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-white">Messages</h2>
          <p className="text-[11px] text-slate-400">
            {conversations.length} conversation
            {conversations.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setView({ type: "new" })}
          className="flex items-center gap-1.5 rounded-xl bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-400"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 custom-scrollbar">
        {loadingConvs ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-6 w-6 animate-spin text-teal-400" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-300">
              No conversations yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Start a chat or send a broadcast
            </p>
            <button
              onClick={() => setView({ type: "new" })}
              className="mt-4 rounded-xl bg-teal-500/20 px-4 py-2 text-xs font-semibold text-teal-300 hover:bg-teal-500/30 transition"
            >
              Start Chatting
            </button>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              myUserId={myId}
              isActive={activeConvId === conv.id}
              onClick={() => setView({ type: "thread", conv })}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatWidget — the floating button + expandable panel
// ---------------------------------------------------------------------------

interface ChatWidgetProps {
  session: UserSession;
}

export default function ChatWidget({ session }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [newMsgNotice, setNewMsgNotice] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);
  const prevUnread = useRef(0);
  const sessionRef = useRef(session);
  const isOpenRef = useRef(isOpen);

  sessionRef.current = session;
  isOpenRef.current = isOpen;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Close chat when clicking anywhere outside the chat widget
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        widgetRef.current &&
        !widgetRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Continuous background unread count poller every 3 seconds
  useEffect(() => {
    let isCancelled = false;

    const pollUnread = async () => {
      const currentSession = sessionRef.current;
      if (!currentSession?.userId) return;

      try {
        const count = await getUnreadChatCount(currentSession);
        if (isCancelled) return;

        if (count > prevUnread.current && !isOpenRef.current) {
          setIsPulsing(true);
          setNewMsgNotice(true);
          setTimeout(() => setIsPulsing(false), 3000);
          setTimeout(() => setNewMsgNotice(false), 6000);
        }
        prevUnread.current = count;
        setUnread(count);
      } catch {
        // Ignore background polling errors
      }
    };

    void pollUnread();
    const interval = setInterval(pollUnread, 3000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleUnreadChange = useCallback((count: number) => {
    prevUnread.current = count;
    setUnread(count);
  }, []);

  if (!isMounted) return null;

  // Don't render on auth pages
  if (
    typeof window !== "undefined" &&
    (window.location.pathname === "/login" ||
      window.location.pathname === "/change-password")
  ) {
    return null;
  }

  const widget = (
    <div ref={widgetRef}>
      {/* Floating button */}
      <button
        id="chat-widget-toggle"
        onClick={() => {
          setIsOpen((o) => !o);
          setIsPulsing(false);
          setNewMsgNotice(false);
        }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-all duration-300 focus:outline-none
          ${isOpen
            ? "bg-slate-700 hover:bg-slate-600 rotate-0 scale-95"
            : unread > 0
            ? "bg-teal-600 hover:bg-teal-500 ring-4 ring-teal-400/40 hover:scale-110"
            : "bg-teal-500 hover:bg-teal-400 hover:scale-110"
          }
          ${isPulsing ? "animate-bounce" : ""}
        `}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <MessageCircle className="h-6 w-6 text-white" />
        )}

        {/* Unread badge with exact count number */}
        {!isOpen && unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white ring-2 ring-white shadow-xl px-1.5 animate-in zoom-in-75 duration-200">
            {unread > 99 ? "99+" : unread}
          </span>
        )}

        {/* Ripple effect when new message */}
        {(isPulsing || (!isOpen && unread > 0)) && (
          <span className="absolute inset-0 rounded-full bg-teal-400 animate-ping opacity-20 pointer-events-none" />
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          id="chat-panel"
          className={`fixed bottom-24 right-6 z-50 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0b2b33] shadow-[0_25px_60px_rgba(0,0,0,0.6)] backdrop-blur-sm
            animate-in slide-in-from-bottom-4 fade-in duration-200
          `}
        >
          {/* Glowing top accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/60 to-transparent" />

          <ChatPanel session={session} onUnreadChange={handleUnreadChange} />
        </div>
      )}
    </div>
  );

  return createPortal(widget, document.body);
}
