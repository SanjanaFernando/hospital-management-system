"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, startTransition, useRef } from "react";
import {
  ChevronLeft,
  ShieldCheck,
  RotateCcw,
  Save,
  Loader,
  Info,
  AlertTriangle,
  ChevronDown,
  Check,
  Plus,
  Trash2,
  Lock,
  X,
} from "lucide-react";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  PERMISSION_CATEGORIES,
  ROLE_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
} from "@/lib/rbac";
import {
  getAllRolePermissions,
  updateRolePermissions,
  resetRolePermissionsToDefault,
  getCustomRoles,
  createCustomRole,
  deleteCustomRole,
  getCustomRolePermissions,
  updateCustomRolePermissions,
} from "@/app/actions/rolePermissionActions";
import {
  StaffRole,
  AllRolePermissions,
  RolePermissionsMap,
  PermissionKey,
  CustomRole,
} from "@/app/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUILT_IN_ROLES: StaffRole[] = [
  "admin",
  "sub_admin",
  "consultant_doctor",
  "main_sister",
  "main_attendant",
];

const BUILT_IN_STYLE: Record<StaffRole, { dot: string; bg: string; text: string; border: string }> = {
  admin:            { dot: "bg-purple-500", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  sub_admin:        { dot: "bg-indigo-500", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  consultant_doctor:{ dot: "bg-teal-500",   bg: "bg-teal-50",   text: "text-teal-700",   border: "border-teal-200"   },
  main_sister:      { dot: "bg-pink-500",   bg: "bg-pink-50",   text: "text-pink-700",   border: "border-pink-200"   },
  main_attendant:   { dot: "bg-amber-500",  bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200"  },
};
const CUSTOM_STYLE = { dot: "bg-slate-500", bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };

const CATEGORY_META: Record<string, { icon: string; description: string }> = {
  "Patient Management":        { icon: "🏥", description: "Register, admit, discharge, and triage patients" },
  "Bed Management":            { icon: "🛏️", description: "Update bed status and assign beds" },
  "Queue Management":          { icon: "📋", description: "View and reorder the patient queue" },
  "Reports & Logs":            { icon: "📊", description: "Access analytics reports and audit logs" },
  "User & Role Administration":{ icon: "🔐", description: "Manage users and role permissions" },
  Communication:               { icon: "📢", description: "Send broadcast messages" },
};

const ALL_CATEGORIES = Object.keys(PERMISSION_CATEGORIES);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyPermissions(): RolePermissionsMap {
  const m: Partial<RolePermissionsMap> = {};
  for (const k of PERMISSION_KEYS) m[k] = false;
  return m as RolePermissionsMap;
}

function getRoleStyle(roleId: string) {
  return BUILT_IN_STYLE[roleId as StaffRole] ?? CUSTOM_STYLE;
}

function getRoleLabel(roleId: string, customRoles: CustomRole[]): string {
  if (roleId in ROLE_LABELS) return ROLE_LABELS[roleId as StaffRole];
  return customRoles.find((r) => r.id === roleId)?.label ?? roleId;
}

// ---------------------------------------------------------------------------
// Create Role Modal
// ---------------------------------------------------------------------------

interface CreateRoleModalProps {
  onClose: () => void;
  onCreated: (roleId: string, label: string) => void;
  session: import("@/app/types").UserSession;
}

function CreateRoleModal({ onClose, onCreated, session }: CreateRoleModalProps) {
  const [label, setLabel] = useState("");
  const [baseRole, setBaseRole] = useState<string>("none");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleCreate = async () => {
    if (!label.trim() || creating) return;
    setCreating(true);
    setError("");
    const result = await createCustomRole(
      label,
      baseRole === "none" ? null : baseRole,
      session
    );
    setCreating(false);
    if (result.ok && result.roleId) {
      onCreated(result.roleId, label.trim());
    } else {
      setError(result.error ?? "Failed to create role.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_25px_60px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-100">
              <Plus className="h-4 w-4 text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Create New Role</h2>
              <p className="text-[11px] text-slate-400">Define a custom role for your hospital</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Role name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Role Name <span className="text-red-500">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") startTransition(() => { void handleCreate(); }); }}
              placeholder="e.g. Senior Nurse, Ward Coordinator…"
              maxLength={40}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
            />
            <p className="mt-1 text-[10px] text-slate-400">{label.length}/40 characters</p>
          </div>

          {/* Base role (permissions template) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Copy permissions from
            </label>
            <select
              value={baseRole}
              onChange={(e) => setBaseRole(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
            >
              <option value="none">Start with all permissions OFF</option>
              {BUILT_IN_ROLES.filter((r) => r !== "admin").map((r) => (
                <option key={r} value={r}>
                  Copy from {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-slate-400">
              You can fine-tune permissions after creation.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              <p className="text-xs font-medium text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => { void handleCreate(); })}
            disabled={!label.trim() || creating}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creating ? "Creating…" : "Create Role"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role Dropdown (built-in + custom)
// ---------------------------------------------------------------------------

interface RoleDropdownProps {
  selectedId: string;
  onChange: (id: string) => void;
  customRoles: CustomRole[];
  dirtyIds: Set<string>;
  onDeleteCustom: (id: string, label: string) => void;
}

function RoleDropdown({ selectedId, onChange, customRoles, dirtyIds, onDeleteCustom }: RoleDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const style = getRoleStyle(selectedId);
  const label = customRoles
    ? getRoleLabel(selectedId, customRoles)
    : selectedId;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (id: string) => { onChange(id); setOpen(false); };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-all shadow-sm hover:shadow-md min-w-56 ${style.bg} ${style.border} ${style.text}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot} shrink-0`} />
        <span className="flex-1 text-left text-sm font-semibold">{label}</span>
        {dirtyIds.has(selectedId) && (
          <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
            Unsaved
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          {/* Built-in roles */}
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Built-in Roles</p>
          </div>
          {BUILT_IN_ROLES.map((role) => {
            const s = BUILT_IN_STYLE[role];
            const isSelected = role === selectedId;
            return (
              <div key={role} className="flex items-center group">
                <button
                  type="button"
                  onClick={() => select(role)}
                  className={`flex flex-1 items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${isSelected ? "bg-slate-50 font-bold text-slate-900" : "font-medium text-slate-700"}`}
                >
                  <span className={`h-2 w-2 rounded-full ${s.dot} shrink-0`} />
                  <span className="flex-1">{ROLE_LABELS[role]}</span>
                  {dirtyIds.has(role) && (
                    <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-white">Unsaved</span>
                  )}
                  {isSelected && <Check className="h-3.5 w-3.5 text-teal-500" />}
                </button>
                {/* Lock icon for built-in — cannot delete */}
                <div className="pr-3 pl-1 opacity-30" title="Built-in roles are protected">
                  <Lock className="h-3 w-3 text-slate-500" />
                </div>
              </div>
            );
          })}

          {/* Custom roles */}
          {customRoles.length > 0 && (
            <>
              <div className="mx-3 my-1 border-t border-slate-100" />
              <div className="px-3 pt-1 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Custom Roles</p>
              </div>
              {customRoles.map((cr) => {
                const isSelected = cr.id === selectedId;
                return (
                  <div key={cr.id} className="flex items-center group">
                    <button
                      type="button"
                      onClick={() => select(cr.id)}
                      className={`flex flex-1 items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${isSelected ? "bg-slate-50 font-bold text-slate-900" : "font-medium text-slate-700"}`}
                    >
                      <span className="h-2 w-2 rounded-full bg-slate-500 shrink-0" />
                      <span className="flex-1">{cr.label}</span>
                      {dirtyIds.has(cr.id) && (
                        <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-white">Unsaved</span>
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-teal-500" />}
                    </button>
                    {/* Delete button for custom roles */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setOpen(false); onDeleteCustom(cr.id, cr.label); }}
                      title={`Delete role "${cr.label}"`}
                      className="pr-3 pl-1 text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </>
          )}
          <div className="h-1" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission Row
// ---------------------------------------------------------------------------

function PermissionRow({ permKey, checked, disabled, onChange }: {
  permKey: PermissionKey; checked: boolean; disabled: boolean; onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`
        w-full flex items-center justify-between gap-4 rounded-xl border px-5 py-4 text-left
        transition-all duration-150 group
        ${disabled
          ? "cursor-not-allowed opacity-50 border-slate-100 bg-slate-50/50"
          : checked
            ? "border-teal-200 bg-teal-50 hover:bg-teal-100/70"
            : "border-slate-200 bg-white hover:bg-slate-50"
        }
      `}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all ${checked ? "bg-teal-500 text-white" : "border-2 border-slate-300 bg-white"}`}>
          {checked && <Check className="h-3.5 w-3.5" />}
        </div>
        <span className={`text-sm font-medium leading-snug ${checked ? "text-teal-800" : "text-slate-700"}`}>
          {PERMISSION_LABELS[permKey]}
        </span>
      </div>
      {disabled && (
        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Fixed</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function RoleManagementPage() {
  const { session } = useAuthSession();

  // Role selection
  const [selectedId, setSelectedId] = useState<string>("consultant_doctor");
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);

  // Permissions (built-in + custom)
  const [builtInPerms, setBuiltInPerms] = useState<AllRolePermissions | null>(null);
  const [savedBuiltIn, setSavedBuiltIn] = useState<AllRolePermissions | null>(null);
  const [customPerms, setCustomPerms] = useState<Record<string, RolePermissionsMap>>({});
  const [savedCustom, setSavedCustom] = useState<Record<string, RolePermissionsMap>>({});

  // UI state
  const [activeTab, setActiveTab] = useState(ALL_CATEGORIES[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: "ok" | "err" }[]>([]);

  const isAuthorized = session.role === "admin";
  const isBuiltIn = BUILT_IN_ROLES.includes(selectedId as StaffRole);
  const isFixed = selectedId === "admin";

  // -------- helpers --------

  const addToast = (msg: string, type: "ok" | "err") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  };

  const getCurrentPerms = (): RolePermissionsMap | null => {
    if (isBuiltIn) return builtInPerms?.[selectedId as StaffRole] ?? null;
    return customPerms[selectedId] ?? null;
  };

  const getSavedPerms = (): RolePermissionsMap | null => {
    if (isBuiltIn) return savedBuiltIn?.[selectedId as StaffRole] ?? null;
    return savedCustom[selectedId] ?? null;
  };

  const isDirty = (roleId: string): boolean => {
    const isBI = BUILT_IN_ROLES.includes(roleId as StaffRole);
    const cur = isBI ? builtInPerms?.[roleId as StaffRole] : customPerms[roleId];
    const sav = isBI ? savedBuiltIn?.[roleId as StaffRole] : savedCustom[roleId];
    if (!cur || !sav) return false;
    return PERMISSION_KEYS.some((k) => cur[k] !== sav[k]);
  };

  const dirtyIds = new Set([
    ...BUILT_IN_ROLES.filter(isDirty),
    ...customRoles.map((r) => r.id).filter(isDirty),
  ]);

  // -------- load --------

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [bi, cr] = await Promise.all([
        getAllRolePermissions(),
        getCustomRoles(),
      ]);
      setBuiltInPerms(bi);
      setSavedBuiltIn(JSON.parse(JSON.stringify(bi)) as AllRolePermissions);
      setCustomRoles(cr);

      // Load permissions for all custom roles
      if (cr.length > 0) {
        const entries = await Promise.all(
          cr.map(async (r) => [r.id, await getCustomRolePermissions(r.id)] as [string, RolePermissionsMap])
        );
        const map = Object.fromEntries(entries);
        setCustomPerms(map);
        setSavedCustom(JSON.parse(JSON.stringify(map)) as Record<string, RolePermissionsMap>);
      }
    } catch {
      addToast("Failed to load permissions.", "err");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthorized) void load(); }, [isAuthorized, load]);

  // -------- toggle --------

  const toggle = (key: PermissionKey) => {
    if (isFixed) return;
    if (isBuiltIn) {
      setBuiltInPerms((prev) => {
        if (!prev) return prev;
        return { ...prev, [selectedId]: { ...prev[selectedId as StaffRole], [key]: !prev[selectedId as StaffRole][key] } };
      });
    } else {
      setCustomPerms((prev) => ({
        ...prev,
        [selectedId]: { ...prev[selectedId], [key]: !prev[selectedId][key] },
      }));
    }
  };

  const toggleAllInTab = () => {
    if (isFixed) return;
    const tabKeys = PERMISSION_CATEGORIES[activeTab] ?? [];
    const cur = getCurrentPerms();
    if (!cur) return;
    const allOn = tabKeys.every((k) => cur[k]);
    if (isBuiltIn) {
      setBuiltInPerms((prev) => {
        if (!prev) return prev;
        const updated = { ...prev[selectedId as StaffRole] };
        for (const k of tabKeys) updated[k] = !allOn;
        return { ...prev, [selectedId]: updated };
      });
    } else {
      setCustomPerms((prev) => {
        const updated = { ...prev[selectedId] };
        for (const k of tabKeys) updated[k] = !allOn;
        return { ...prev, [selectedId]: updated };
      });
    }
  };

  // -------- save --------

  const saveSelected = async () => {
    const cur = getCurrentPerms();
    if (!cur) return;
    setSaving(true);
    let result: { ok: boolean; error?: string };
    if (isBuiltIn) {
      result = await updateRolePermissions(selectedId as StaffRole, cur, session);
      if (result.ok) {
        setSavedBuiltIn((prev) =>
          prev ? { ...prev, [selectedId]: { ...cur } } : prev
        );
      }
    } else {
      result = await updateCustomRolePermissions(selectedId, cur, session);
      if (result.ok) {
        setSavedCustom((prev) => ({ ...prev, [selectedId]: { ...cur } }));
      }
    }
    setSaving(false);
    if (result.ok) {
      addToast(`Permissions for "${getRoleLabel(selectedId, customRoles)}" saved.`, "ok");
    } else {
      addToast(result.error ?? "Save failed.", "err");
    }
  };

  // -------- reset --------

  const resetSelected = async () => {
    if (!isBuiltIn) {
      if (!confirm(`Reset "${getRoleLabel(selectedId, customRoles)}" to all permissions OFF?`)) return;
      setResetting(true);
      const empty = emptyPermissions();
      const result = await updateCustomRolePermissions(selectedId, empty, session);
      setResetting(false);
      if (result.ok) {
        setCustomPerms((prev) => ({ ...prev, [selectedId]: empty }));
        setSavedCustom((prev) => ({ ...prev, [selectedId]: empty }));
        addToast("Permissions reset.", "ok");
      } else {
        addToast(result.error ?? "Reset failed.", "err");
      }
      return;
    }
    if (!confirm(`Reset "${ROLE_LABELS[selectedId as StaffRole]}" to default permissions?`)) return;
    setResetting(true);
    const result = await resetRolePermissionsToDefault(selectedId as StaffRole, session);
    setResetting(false);
    if (result.ok) {
      const def = { ...DEFAULT_ROLE_PERMISSIONS[selectedId as StaffRole] };
      setBuiltInPerms((prev) => prev ? { ...prev, [selectedId]: def } : prev);
      setSavedBuiltIn((prev) => prev ? { ...prev, [selectedId]: def } : prev);
      addToast(`"${ROLE_LABELS[selectedId as StaffRole]}" reset to defaults.`, "ok");
    } else {
      addToast(result.error ?? "Reset failed.", "err");
    }
  };

  // -------- create custom role --------

  const handleRoleCreated = async (roleId: string, label: string) => {
    setShowCreateModal(false);
    const newRole: CustomRole = { id: roleId, label, createdAt: new Date() };
    setCustomRoles((prev) => [...prev, newRole]);
    const perms = await getCustomRolePermissions(roleId);
    setCustomPerms((prev) => ({ ...prev, [roleId]: perms }));
    setSavedCustom((prev) => ({ ...prev, [roleId]: { ...perms } }));
    setSelectedId(roleId);
    addToast(`Role "${label}" created.`, "ok");
  };

  // -------- delete custom role --------

  const handleDeleteCustom = async (roleId: string, label: string) => {
    if (!confirm(`Permanently delete the role "${label}"? This cannot be undone.`)) return;
    const result = await deleteCustomRole(roleId, session);
    if (result.ok) {
      setCustomRoles((prev) => prev.filter((r) => r.id !== roleId));
      setCustomPerms((prev) => { const n = { ...prev }; delete n[roleId]; return n; });
      setSavedCustom((prev) => { const n = { ...prev }; delete n[roleId]; return n; });
      if (selectedId === roleId) setSelectedId("consultant_doctor");
      addToast(`Role "${label}" deleted.`, "ok");
    } else {
      addToast(result.error ?? "Delete failed.", "err");
    }
  };

  // -------- render helpers --------

  const cur = getCurrentPerms();
  const tabKeys = PERMISSION_CATEGORIES[activeTab] ?? [];
  const tabAllOn = !isFixed && cur ? tabKeys.every((k) => cur[k]) : false;
  const grantedInTab = cur ? tabKeys.filter((k) => cur[k]).length : 0;
  const currentDirty = isDirty(selectedId);

  // ---------------------------------------------------------------------------
  // Access denied
  // ---------------------------------------------------------------------------
  if (!isAuthorized) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white/90 p-10 shadow-sm text-center">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-800 mb-1">Access Denied</h1>
        <p className="text-slate-500 text-sm">Only the primary Admin can manage role permissions.</p>
        <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition">
          <ChevronLeft className="h-4 w-4" /> Go Home
        </Link>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-5 pb-12">
      {/* Toasts */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-lg border ${t.type === "ok" ? "bg-emerald-900 border-emerald-500/30 text-emerald-200" : "bg-red-900 border-red-500/30 text-red-200"}`}>
            {t.type === "ok" ? "✅" : "❌"} {t.msg}
          </div>
        ))}
      </div>

      {/* Create Role Modal */}
      {showCreateModal && (
        <CreateRoleModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleRoleCreated}
          session={session}
        />
      )}

      {/* Page Header */}
      <div className="flex items-start gap-3">
        <Link href="/" className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-teal-500 shrink-0" />
            <h1 className="text-2xl font-bold text-slate-900">Role Management</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Create, configure and delete roles — select a role, pick a category, toggle permissions
          </p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Role dropdown */}
        <RoleDropdown
          selectedId={selectedId}
          onChange={setSelectedId}
          customRoles={customRoles}
          dirtyIds={dirtyIds}
          onDeleteCustom={handleDeleteCustom}
        />

        {/* Create Role */}
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700 shadow-sm hover:bg-teal-100 transition"
        >
          <Plus className="h-4 w-4" />
          Create Role
        </button>

        {/* Delete (custom only) */}
        {!isBuiltIn && (
          <button
            type="button"
            onClick={() => startTransition(() => { void handleDeleteCustom(selectedId, getRoleLabel(selectedId, customRoles)); })}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-100 transition"
          >
            <Trash2 className="h-4 w-4" />
            Delete Role
          </button>
        )}

        <div className="flex-1" />

        {/* Reset + Save */}
        <button
          type="button"
          onClick={() => startTransition(() => { void resetSelected(); })}
          disabled={isFixed || resetting}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {resetting ? <Loader className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          {isBuiltIn ? "Reset to Defaults" : "Reset to Empty"}
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => { void saveSelected(); })}
          disabled={isFixed || saving || !currentDirty}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      {/* Admin / fixed notice */}
      {isFixed && (
        <div className="flex items-start gap-3 rounded-2xl border border-purple-100 bg-purple-50 p-4">
          <Lock className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
          <p className="text-xs text-purple-700">
            <strong>Admin</strong> has all permissions permanently enabled and cannot be changed.
          </p>
        </div>
      )}

      {!isFixed && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Editing <strong>{getRoleLabel(selectedId, customRoles)}</strong> — permissions control what this role can see and do.
            {!isBuiltIn && " This is a custom role."}
          </p>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading || !builtInPerms ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader className="h-8 w-8 animate-spin text-teal-400" />
            <p className="text-sm text-slate-400">Loading permissions…</p>
          </div>
        ) : (
          <>
            {/* Category tabs */}
            <div className="flex overflow-x-auto border-b border-slate-100 bg-slate-50/60 px-2 pt-2 gap-1">
              {ALL_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const catKeys = PERMISSION_CATEGORIES[cat] ?? [];
                const granted = cur ? catKeys.filter((k) => cur[k]).length : 0;
                const isActive = activeTab === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveTab(cat)}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-semibold transition-all ${isActive ? "bg-white border border-b-white border-slate-200 -mb-px text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/60"}`}
                  >
                    <span>{meta?.icon ?? "⚙️"}</span>
                    <span>{cat}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-teal-100 text-teal-700" : "bg-slate-200 text-slate-500"}`}>
                      {granted}/{catKeys.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{CATEGORY_META[activeTab]?.icon ?? "⚙️"}</span>
                    <h2 className="text-base font-bold text-slate-900">{activeTab}</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{CATEGORY_META[activeTab]?.description}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-400 font-medium">{grantedInTab} of {tabKeys.length} granted</span>
                  {!isFixed && (
                    <button
                      type="button"
                      onClick={toggleAllInTab}
                      className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition underline underline-offset-2"
                    >
                      {tabAllOn ? "Deselect All" : "Select All"}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                {tabKeys.map((key) => (
                  <PermissionRow
                    key={key}
                    permKey={key}
                    checked={cur?.[key] ?? false}
                    disabled={isFixed}
                    onChange={() => toggle(key)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 px-1">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-500">
            <Check className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs text-slate-500">Granted</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md border-2 border-slate-300 bg-white" />
          <span className="text-xs text-slate-500">Denied</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-500">Built-in role (protected from deletion)</span>
        </div>
        <div className="flex items-center gap-2">
          <Trash2 className="h-3.5 w-3.5 text-red-400" />
          <span className="text-xs text-slate-500">Custom role (can be deleted)</span>
        </div>
      </div>
    </div>
  );
}
