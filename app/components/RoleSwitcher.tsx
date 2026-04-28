"use client";

import Link from "next/link";
import { StaffRole, UserSession } from "@/app/types";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { ROLE_LABELS } from "@/lib/rbac";

const wardOptions = [
  { id: "ward-0", label: "Ward 3" },
  { id: "ward-1", label: "Ward 4" },
  { id: "ward-2", label: "Ward 5" },
  { id: "ward-3", label: "Ward 6" },
];

export default function RoleSwitcher() {
  const { session, setSession } = useAuthSession();

  const updateRole = (role: StaffRole) => {
    if (role === "admin") {
      setSession({ role, displayName: ROLE_LABELS[role] });
      return;
    }

    const defaultWardId = session.wardId || "ward-0";
    setSession({
      role,
      wardId: defaultWardId,
      displayName: ROLE_LABELS[role],
    });
  };

  const updateWard = (wardId: string) => {
    if (session.role === "admin") {
      return;
    }

    setSession({ ...session, wardId });
  };

  const updateName = (displayName: string) => {
    const next: UserSession = {
      ...session,
      displayName,
    };
    setSession(next);
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:w-[70%]">
          <label className="text-xs font-semibold text-slate-700">
            Active Role
            <select
              value={session.role}
              onChange={(e) => updateRole(e.target.value as StaffRole)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="admin">Admin</option>
              <option value="consultant_doctor">Consultant Doctor</option>
              <option value="main_sister">Main Sister</option>
              <option value="main_attendant">Main Attendant</option>
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Assigned Ward
            <select
              value={session.wardId || "ward-0"}
              onChange={(e) => updateWard(e.target.value)}
              disabled={session.role === "admin"}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {wardOptions.map((ward) => (
                <option key={ward.id} value={ward.id}>
                  {ward.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Display Name
            <input
              value={session.displayName || ""}
              onChange={(e) => updateName(e.target.value)}
              placeholder="Enter staff name"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          {session.role === "admin" && (
            <Link
              href="/admin/staff"
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Register Ward Staff
            </Link>
          )}
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            {session.role === "admin"
              ? "Global Access"
              : `Scoped to ${(session.wardId || "ward-0").toUpperCase()}`}
          </span>
        </div>
      </div>
    </div>
  );
}
