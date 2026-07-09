"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
  Shield,
  UserRound,
  Bed,
  ClipboardPlus,
  LogOut as LogOutIcon,
  Users,
  ArrowLeftRight,
  Wrench,
  Bell,
} from "lucide-react";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { getUserLogs } from "@/app/actions/logActions";
import { canManageStaff } from "@/lib/rbac";
import { UserLog, LogAction } from "@/app/types";

const ACTION_CONFIG: Record<
  LogAction,
  { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }
> = {
  patient_registered: {
    label: "Patient Registered",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50 border-emerald-200",
    icon: ClipboardPlus,
  },
  patient_discharged: {
    label: "Patient Discharged",
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
    icon: LogOutIcon,
  },
  patient_assigned_bed: {
    label: "Bed Assigned",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
    icon: Bed,
  },
  patient_force_assigned: {
    label: "Force Assigned",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    icon: ArrowLeftRight,
  },
  patient_moved_to_queue: {
    label: "Moved to Queue",
    color: "text-cyan-700",
    bgColor: "bg-cyan-50 border-cyan-200",
    icon: Users,
  },
  staff_registered: {
    label: "Staff Registered",
    color: "text-violet-700",
    bgColor: "bg-violet-50 border-violet-200",
    icon: UserRound,
  },
  role_switched: {
    label: "Role Switched",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50 border-indigo-200",
    icon: Shield,
  },
  bed_status_updated: {
    label: "Bed Status Updated",
    color: "text-teal-700",
    bgColor: "bg-teal-50 border-teal-200",
    icon: Wrench,
  },
  notification_created: {
    label: "Notification Created",
    color: "text-pink-700",
    bgColor: "bg-pink-50 border-pink-200",
    icon: Bell,
  },
};

const ITEMS_PER_PAGE = 20;

export default function AdminLogsPage() {
  const { session } = useAuthSession();
  const [logs, setLogs] = useState<UserLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionFilter, setActionFilter] = useState<LogAction | "">("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const loadLogs = useCallback(async () => {
    if (!canManageStaff(session)) return;

    setIsLoading(true);
    setError("");

    try {
      const result = await getUserLogs(session, {
        page,
        limit: ITEMS_PER_PAGE,
        actionFilter: actionFilter || undefined,
        search: search || undefined,
      });
      setLogs(result.logs);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session, page, actionFilter, search]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    void loadLogs();
  };

  const formatTimestamp = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relative = "";
    if (diffMins < 1) relative = "Just now";
    else if (diffMins < 60) relative = `${diffMins}m ago`;
    else if (diffHours < 24) relative = `${diffHours}h ago`;
    else if (diffDays < 7) relative = `${diffDays}d ago`;
    else relative = d.toLocaleDateString();

    return {
      relative,
      full: d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
  };

  if (!canManageStaff(session)) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50/80 p-8 text-center shadow-sm">
        <Shield className="mx-auto mb-3 h-12 w-12 text-red-300" />
        <h1 className="text-xl font-bold text-red-800">Access Denied</h1>
        <p className="mt-2 text-sm text-red-600">
          Only admins can view user activity logs.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-100 px-4 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                User Activity Logs
              </h1>
              <p className="text-sm text-slate-500">
                {total} total log{total !== 1 ? "s" : ""} recorded
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:flex-row">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, details, or ID..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100"
          />
        </form>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value as LogAction | "");
              setPage(1);
            }}
            className="appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-8 text-sm text-slate-700 transition focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100"
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Logs List */}
      <div className="rounded-2xl border border-slate-200 bg-white/90 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-teal-200 border-t-teal-600" />
              <p className="text-sm text-slate-500">Loading logs...</p>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-3 rounded-2xl bg-slate-100 p-4">
              <Shield className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">No logs found</p>
            <p className="mt-1 text-xs text-slate-500">
              {search || actionFilter
                ? "Try adjusting your filters"
                : "Activity logs will appear here as users perform actions"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const config = ACTION_CONFIG[log.action] || {
                label: log.action,
                color: "text-slate-700",
                bgColor: "bg-slate-50 border-slate-200",
                icon: Shield,
              };
              const Icon = config.icon;
              const time = formatTimestamp(log.timestamp);

              return (
                <div
                  key={log.id}
                  className="group flex items-start gap-4 px-5 py-4 transition hover:bg-slate-50/80"
                >
                  {/* Action Icon */}
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${config.bgColor}`}
                  >
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${config.bgColor} ${config.color}`}
                      >
                        {config.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        by{" "}
                        <span className="font-semibold text-slate-700">
                          {log.actorName}
                        </span>
                      </span>
                      <span className="hidden text-xs text-slate-400 sm:inline">
                        •
                      </span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {log.actorRole.replace("_", " ")}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="mt-1.5 space-y-0.5">
                      {log.targetName && (
                        <p className="text-sm text-slate-700">
                          <span className="text-slate-400">Target:</span>{" "}
                          <span className="font-medium">{log.targetName}</span>
                          {log.targetId && (
                            <span className="ml-1 text-xs text-slate-400">
                              ({log.targetId})
                            </span>
                          )}
                        </p>
                      )}
                      {log.details && (
                        <p className="text-sm text-slate-600">{log.details}</p>
                      )}
                      {log.wardId && (
                        <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                          {log.wardId}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-slate-500">
                      {time.relative}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {time.full}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 shadow-sm">
          <p className="text-sm text-slate-600">
            Page <span className="font-semibold">{page}</span> of{" "}
            <span className="font-semibold">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
