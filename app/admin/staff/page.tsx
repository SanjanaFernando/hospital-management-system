"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import {
  getStaffMembers,
  registerStaffMember,
} from "@/app/actions/staffActions";
import { ROLE_LABELS, canManageStaff } from "@/lib/rbac";
import { StaffMember } from "@/app/types";

const wardOptions = [
  { id: "ward-3", label: "Ward 3 - Surgical" },
  { id: "ward-4", label: "Ward 4 - Surgical" },
  { id: "ward-5", label: "Ward 5 - Surgical" },
  { id: "ward-6", label: "Ward 6 - Surgical" },
];

export default function AdminStaffPage() {
  const { session } = useAuthSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    role: "consultant_doctor" as StaffMember["role"],
    wardId: wardOptions[0].id,
  });

  const loadStaff = useCallback(async () => {
    if (!canManageStaff(session)) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = await getStaffMembers(session);
      setStaff(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const result = await registerStaffMember({
      ...formData,
      actor: session,
    });

    if (!result.success) {
      setError(result.error || "Failed to register staff member");
      return;
    }

    setMessage("Staff member registered successfully.");
    setFormData({
      name: "",
      role: "consultant_doctor",
      wardId: wardOptions[0].id,
    });
    await loadStaff();
  };

  if (!canManageStaff(session)) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Access denied
          </h1>
          <p className="text-gray-600">Only Admin can register ward staff.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft size={20} />
        </Link>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Ward Staff Registration
          </h1>
          <p className="text-sm text-gray-600">
            Register Consultant Doctor, Main Sister, and Main Attendant for the
            4 wards.
          </p>

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5"
          >
            <input
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Staff name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              required
            />

            <select
              value={formData.role}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  role: e.target.value as StaffMember["role"],
                }))
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              <option value="consultant_doctor">Consultant Doctor</option>
              <option value="main_sister">Main Sister</option>
              <option value="main_attendant">Main Attendant</option>
            </select>

            <select
              value={formData.wardId}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, wardId: e.target.value }))
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              {wardOptions.map((ward) => (
                <option key={ward.id} value={ward.id}>
                  {ward.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Register Staff
            </button>
          </form>

          {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
          {message && (
            <p className="text-sm text-emerald-700 mt-3">{message}</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Registered Staff
          </h2>
          {isLoading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : staff.length === 0 ? (
            <p className="text-sm text-gray-600">No staff registered yet.</p>
          ) : (
            <div className="space-y-3">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="rounded-lg border border-gray-200 p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{member.name}</p>
                    <p className="text-xs text-gray-600">
                      {ROLE_LABELS[member.role]} • {member.wardId.toUpperCase()}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {new Date(member.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
