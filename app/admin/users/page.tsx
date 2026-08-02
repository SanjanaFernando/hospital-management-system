"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  UserPlus,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Copy,
  CheckCircle2,
  Edit,
  Trash2,
  X,
} from "lucide-react";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canManageStaff, ROLE_LABELS } from "@/lib/rbac";
import { StaffRole } from "@/app/types";
import {
  createUser,
  getUsers,
  resetUserPassword,
  toggleUserActive,
  updateUser,
  deleteUser,
  type UserListItem,
} from "@/app/actions/userActions";

const wardOptions = [
  { id: "ward-3", label: "Ward 3 - Surgical" },
  { id: "ward-4", label: "Ward 4 - Surgical" },
  { id: "ward-5", label: "Ward 5 - Surgical" },
  { id: "ward-6", label: "Ward 6 - Surgical" },
];

export default function AdminUsersPage() {
  const { session } = useAuthSession();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [createdUserId, setCreatedUserId] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    role: "consultant_doctor" as StaffRole,
    wardId: wardOptions[0].id,
  });

  const [selectedWards, setSelectedWards] = useState<string[]>([
    wardOptions[0].id,
  ]);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!canManageStaff(session)) return;

    setIsLoading(true);
    setError("");

    try {
      const data = await getUsers(session);
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setCreatedUserId("");

    if (editingUserId) {
      const result = await updateUser(
        editingUserId,
        {
          displayName: formData.displayName,
          email: formData.email,
          role: formData.role,
          wardId: formData.role === "admin" ? undefined : selectedWards[0],
          wardIds: formData.role === "admin" ? undefined : selectedWards,
        },
        session
      );

      if (!result.success) {
        setError(result.error || "Failed to update user");
        return;
      }

      setMessage(`User ${editingUserId} updated successfully!`);
      setFormData({
        displayName: "",
        email: "",
        role: "consultant_doctor",
        wardId: wardOptions[0].id,
      });
      setSelectedWards([wardOptions[0].id]);
      setEditingUserId(null);
      await loadUsers();
    } else {
      const result = await createUser({
        ...formData,
        wardId: formData.role === "admin" ? undefined : selectedWards[0],
        wardIds: formData.role === "admin" ? undefined : selectedWards,
        actor: session,
      });

      if (!result.success) {
        setError(result.error || "Failed to create user");
        return;
      }

      setMessage(`User created successfully!`);
      setCreatedUserId(result.userId || "");
      setFormData({
        displayName: "",
        email: "",
        role: "consultant_doctor",
        wardId: wardOptions[0].id,
      });
      setSelectedWards([wardOptions[0].id]);
      await loadUsers();
    }
  };

  const handleEditUser = (user: UserListItem) => {
    setError("");
    setMessage("");
    setCreatedUserId("");

    setEditingUserId(user.userId);
    setFormData({
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      wardId: user.wardId || wardOptions[0].id,
    });
    setSelectedWards(
      user.wardIds && user.wardIds.length > 0
        ? user.wardIds
        : [user.wardId || wardOptions[0].id]
    );
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setFormData({
      displayName: "",
      email: "",
      role: "consultant_doctor",
      wardId: wardOptions[0].id,
    });
    setSelectedWards([wardOptions[0].id]);
  };

  const handleDeleteUser = async (userId: string) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete user ${userId}? This action cannot be undone.`
      )
    ) {
      return;
    }

    setError("");
    setMessage("");

    const result = await deleteUser(userId, session);
    if (!result.success) {
      setError(result.error || "Failed to delete user");
      return;
    }

    setMessage(`User ${userId} deleted successfully.`);
    if (editingUserId === userId) {
      handleCancelEdit();
    }
    await loadUsers();
  };

  const handleResetPassword = async (userId: string) => {
    if (
      !confirm(
        `Reset password for user ${userId}? A new temporary password will be emailed to them.`
      )
    )
      return;

    const result = await resetUserPassword(userId, session);
    if (result.success) {
      setMessage(`Password reset for user ${userId}.`);
      await loadUsers();
    } else {
      setError(result.error || "Failed to reset password");
    }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    const action = isActive ? "deactivate" : "activate";
    if (!confirm(`Are you sure you want to ${action} user ${userId}?`))
      return;

    const result = await toggleUserActive(userId, session);
    if (result.success) {
      setMessage(`User ${userId} ${action}d.`);
      await loadUsers();
    } else {
      setError(result.error || `Failed to ${action} user`);
    }
  };

  const copyUserId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (!canManageStaff(session)) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white/90 p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Access Denied
        </h1>
        <p className="text-gray-600">Only Admin can manage users.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            User Management
          </h1>
          <p className="text-sm text-slate-600">
            Create, manage, and control user access
          </p>
        </div>
      </div>

      {/* Create / Edit User Form */}
      <div className="rounded-2xl border border-teal-200 bg-white/90 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-bold text-slate-900">
            {editingUserId ? `Edit User: ${editingUserId}` : "Create New User"}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-slate-700">
              Full Name
              <input
                value={formData.displayName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    displayName: e.target.value,
                  }))
                }
                placeholder="Dr. Anusha Perera"
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400"
              />
            </label>

            <label className="text-xs font-semibold text-slate-700">
              Email Address
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                placeholder="user@gmail.com"
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400"
              />
            </label>

            <label className="text-xs font-semibold text-slate-700">
              Role
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    role: e.target.value as StaffRole,
                  }))
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="consultant_doctor">Consultant Doctor</option>
                <option value="main_sister">Main Sister</option>
                <option value="main_attendant">Main Attendant</option>
                {session.role === "admin" && (
                  <option value="sub_admin">Sub Admin</option>
                )}
              </select>
            </label>

            {formData.role !== "admin" && formData.role !== "sub_admin" && (
              <div className="md:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-semibold text-slate-700">
                    Assigned Wards
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = wardOptions.every((w) =>
                        selectedWards.includes(w.id)
                      );
                      setSelectedWards(
                        allSelected ? [wardOptions[0].id] : wardOptions.map((w) => w.id)
                      );
                    }}
                    className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors underline underline-offset-2"
                  >
                    {wardOptions.every((w) => selectedWards.includes(w.id))
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {wardOptions.map((ward) => {
                    const checked = selectedWards.includes(ward.id);
                    return (
                      <label
                        key={ward.id}
                        className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer select-none font-medium"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (checked) {
                              if (selectedWards.length > 1) {
                                setSelectedWards(
                                  selectedWards.filter((id) => id !== ward.id)
                                );
                              }
                            } else {
                              setSelectedWards([...selectedWards, ward.id]);
                            }
                          }}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4"
                        />
                        {ward.label.split(" - ")[0]}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm"
            >
              {editingUserId ? "Save Changes" : "Create User"}
            </button>

            {editingUserId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            )}

            {!editingUserId && (
              <p className="text-xs text-slate-500">
                A random temporary password will be emailed to the user
              </p>
            )}
          </div>
        </form>

        {/* Success with created User ID */}
        {message && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">{message}</p>
            {createdUserId && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-emerald-700">
                  User ID:
                </span>
                <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-lg font-bold font-mono text-emerald-900 tracking-wider">
                  {createdUserId}
                </span>
                <button
                  type="button"
                  onClick={() => copyUserId(createdUserId)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition"
                >
                  {copiedId ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
        )}
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-teal-200 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          Registered Users
        </h2>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-600">No users registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-700">
                    ID
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-700">
                    Name
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-700">
                    Email
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-700">
                    Role
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-700">
                    Ward
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-700">
                    Status
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isRowUserAdmin = user.role === "admin";
                  const isRowUserAdminLike = user.role === "admin" || user.role === "sub_admin";
                  const canManageThisRow = !isRowUserAdmin && (session.role === "admin" || !isRowUserAdminLike);

                  return (
                    <tr
                      key={user.userId}
                      className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                    >
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
                      {user.userId}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800">
                      {user.displayName}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{user.email}</td>
                    <td className="py-3 px-3">
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {user.role === "admin"
                        ? "—"
                        : user.wardIds && user.wardIds.length > 0
                        ? user.wardIds
                            .map(
                              (id) =>
                                wardOptions.find((w) => w.id === id)?.label.split(" - ")[0] || id
                            )
                            .join(", ")
                        : user.wardId
                        ? wardOptions.find((w) => w.id === user.wardId)?.label.split(" - ")[0] || user.wardId
                        : "—"}
                    </td>
                    <td className="py-3 px-3">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Inactive
                        </span>
                      )}
                      {user.mustChangePassword && (
                        <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          Needs PW Change
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {canManageThisRow ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleEditUser(user)}
                            title="Edit User Details"
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {user.userId !== "100000" ? (
                            <button
                              type="button"
                              onClick={() => handleResetPassword(user.userId)}
                              title="Reset temporary password (sends email)"
                              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : (
                            <span
                              title="Admin password can only be reset via backend code/script"
                              className="inline-flex items-center justify-center rounded-lg border border-slate-100 bg-slate-50/50 p-1.5 text-slate-400 select-none cursor-not-allowed"
                            >
                              <RotateCcw className="w-4 h-4 text-slate-300" />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleActive(
                                user.userId,
                                user.isActive
                              )
                            }
                            title={
                              user.isActive ? "Deactivate User" : "Activate User"
                            }
                            className={`inline-flex items-center justify-center rounded-lg border p-1.5 transition shadow-xs ${
                              user.isActive
                                ? "border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
                               : "border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                            }`}
                          >
                            {user.isActive ? (
                              <ShieldOff className="w-4 h-4" />
                            ) : (
                              <ShieldCheck className="w-4 h-4" />
                            )}
                          </button>
                          {session.userId !== user.userId && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user.userId)}
                              title="Permanently Delete User"
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 transition shadow-xs"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span
                          title="Only primary Admin can manage Admin/Sub Admin accounts"
                          className="text-xs font-semibold text-slate-400 select-none"
                        >
                          Protected
                        </span>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
