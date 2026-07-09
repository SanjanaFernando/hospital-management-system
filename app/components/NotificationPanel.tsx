"use client";

import { useEffect, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Check,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
} from "lucide-react";
import { UserSession, Notification } from "@/app/types";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/actions/notificationActions";
import { checkWardAlerts } from "@/app/actions/checkWardAlerts";

interface NotificationPanelProps {
  session: UserSession;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function NotificationPanel({ session }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchAndRefresh = async () => {
    try {
      // First, run background scan for ward alerts
      await checkWardAlerts();

      // Retrieve notifications
      const { notifications: list } = await getNotifications(session, {
        limit: 20,
      });

      // Count unread
      const unread = list.filter((n) => !n.isRead).length;

      // Trigger bell ring animation if new unread notification arrives
      if (unread > unreadCount) {
        setIsRinging(true);
        setTimeout(() => setIsRinging(false), 1200);
      }

      setNotifications(list);
      setUnreadCount(unread);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  useEffect(() => {
    void fetchAndRefresh();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      void fetchAndRefresh();
    }, 30000);

    return () => clearInterval(interval);
  }, [session, unreadCount]);

  const handleMarkRead = async (id: string) => {
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    await markNotificationRead(id, session);
  };

  const handleMarkAllRead = async () => {
    // Optimistic UI update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    await markAllNotificationsRead(session);
  };

  const getSeverityStyles = (severity: Notification["severity"], isRead: boolean) => {
    if (isRead) {
      return {
        bg: "bg-white/5 border-white/5 opacity-60",
        iconColor: "text-slate-400",
        dotColor: "bg-slate-500",
        badge: "border-slate-500/20 text-slate-400 bg-slate-500/10",
      };
    }

    switch (severity) {
      case "critical":
        return {
          bg: "bg-red-500/10 border-red-500/30 animate-pulse-slow",
          iconColor: "text-red-400",
          dotColor: "bg-red-500",
          badge: "border-red-500/30 text-red-300 bg-red-500/20",
        };
      case "warning":
        return {
          bg: "bg-amber-500/10 border-amber-500/30",
          iconColor: "text-amber-400",
          dotColor: "bg-amber-500",
          badge: "border-amber-500/30 text-amber-300 bg-amber-500/20",
        };
      case "info":
      default:
        return {
          bg: "bg-teal-500/10 border-teal-500/20",
          iconColor: "text-teal-300",
          dotColor: "bg-teal-400",
          badge: "border-teal-500/30 text-teal-300 bg-teal-500/20",
        };
    }
  };

  const getNotificationIcon = (type: Notification["type"], severity: Notification["severity"]) => {
    if (severity === "critical") return <AlertCircle className="h-5 w-5 shrink-0" />;
    if (severity === "warning") return <AlertTriangle className="h-5 w-5 shrink-0" />;
    return <Info className="h-5 w-5 shrink-0" />;
  };

  // Build modal content overlay
  const modalContent = isOpen && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-all duration-300 animate-in fade-in"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b2b33] p-6 text-slate-100 shadow-[0_25px_60px_rgba(0,0,0,0.55)] flex flex-col max-h-[80vh] overflow-hidden transform transition-all duration-300 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell className="h-5 w-5 text-teal-200" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-[#0b2b33]">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Notifications
              </h2>
              <p className="text-[11px] text-slate-400">
                {unreadCount > 0
                  ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}`
                  : "All clear"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => startTransition(() => { void handleMarkAllRead(); })}
                className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-teal-200 hover:bg-white/10 hover:text-white transition duration-200"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition duration-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1 custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-white/5 p-4 border border-white/5 text-slate-500 mb-3">
                <Bell className="h-8 w-8" />
              </div>
              <p className="text-sm font-semibold text-slate-300">No Notifications</p>
              <p className="text-xs text-slate-400 mt-1">You are all caught up!</p>
            </div>
          ) : (
            notifications.map((notif) => {
              const styles = getSeverityStyles(notif.severity, notif.isRead);
              return (
                <div
                  key={notif.id}
                  className={`relative flex items-start gap-3 rounded-2xl border p-4 transition-all duration-300 text-xs sm:text-sm ${styles.bg}`}
                >
                  {/* Indicator dot */}
                  {!notif.isRead && (
                    <span className={`absolute top-4 right-4 h-2 w-2 rounded-full ${styles.dotColor}`} />
                  )}

                  {/* Severity Icon */}
                  <div className={`mt-0.5 ${styles.iconColor}`}>
                    {getNotificationIcon(notif.type, notif.severity)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-100 text-sm">
                        {notif.title}
                      </span>
                      <span className="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-slate-300 leading-relaxed text-xs">
                      {notif.message}
                    </p>
                  </div>

                  {/* Mark read check button */}
                  {!notif.isRead && (
                    <button
                      onClick={() => startTransition(() => { void handleMarkRead(notif.id); })}
                      title="Mark read"
                      className="mt-0.5 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition duration-200"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        type="button"
        title="Open notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-teal-200 transition hover:bg-white/10 hover:text-white hover:scale-105 shrink-0 focus:outline-hidden"
      >
        <Bell
          className={`h-4 w-4 transition-transform duration-300 ${
            isRinging ? "animate-bounce text-yellow-300" : ""
          }`}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-[#0b2b33]">
            {unreadCount}
          </span>
        )}
      </button>

      {isMounted && isOpen && createPortal(modalContent, document.body)}
    </>
  );
}
