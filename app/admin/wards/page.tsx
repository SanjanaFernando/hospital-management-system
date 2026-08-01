"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Bed,
  Plus,
  Edit,
  Trash2,
  FileText,
  Search,
  ChevronDown,
  ShieldCheck,
  Building2,
  AlertTriangle,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canManageStaff } from "@/lib/rbac";
import { Ward, WardFormField } from "@/app/types";
import {
  getWardsWithPatients,
  createWardAction,
  updateWardAction,
  deleteWardAction,
} from "@/app/actions/wardActions";
import { getWardFormConfig } from "@/app/actions/wardFormActions";
import WardFormEditorModal from "@/app/components/WardFormEditorModal";

export default function WardManagementPage() {
  const { session } = useAuthSession();
  const isAdminOrSubAdmin = canManageStaff(session);

  const [wards, setWards] = useState<Ward[]>([]);
  const [wardFormMap, setWardFormMap] = useState<Record<string, WardFormField[]>>({});
  const [loading, setLoading] = useState(true);

  // Search / Selection state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDropdownWardId, setSelectedDropdownWardId] = useState<string>("all");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWard, setEditingWard] = useState<Ward | null>(null);
  const [formEditingWard, setFormEditingWard] = useState<Ward | null>(null);

  // Add Ward Form State
  const [newWardName, setNewWardName] = useState("");
  const [newWardId, setNewWardId] = useState("");
  const [normalBeds, setNormalBeds] = useState(20);
  const [icuBeds, setIcuBeds] = useState(4);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Edit Ward Name State
  const [editName, setEditName] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const wardData = await getWardsWithPatients();
      setWards(wardData);

      const map: Record<string, WardFormField[]> = {};
      for (const w of wardData) {
        const wId = w.wardId || w.id || "";
        if (wId) {
          try {
            map[wId] = await getWardFormConfig(wId);
          } catch {
            // ignore error per ward
          }
        }
      }
      setWardFormMap(map);
    } catch (err) {
      console.error("Failed to load wards:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminOrSubAdmin) {
      void loadData();
    }
  }, [isAdminOrSubAdmin]);

  if (!isAdminOrSubAdmin) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white/90 p-8 shadow-xs text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-4">
          Only Admins and Sub-Admins can access Ward Management.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-700 transition"
        >
          <ChevronLeft className="w-4 h-4" /> Return to Dashboard
        </Link>
      </div>
    );
  }

  // Filtered wards based on Search Input or Dropdown selection
  const filteredWards = wards.filter((ward) => {
    const wId = ward.wardId || ward.id || "";
    // If specific dropdown ward selected
    if (selectedDropdownWardId !== "all" && wId !== selectedDropdownWardId) {
      return false;
    }
    // Search query filter (matches ward name or wardId)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        (ward.name || "").toLowerCase().includes(q) ||
        wId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreateWard = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError("");
    setActionSuccess("");

    if (!newWardName.trim()) {
      setActionError("Ward name is required.");
      return;
    }

    setActionLoading(true);
    const res = await createWardAction(
      newWardName,
      newWardId,
      normalBeds,
      icuBeds,
      session
    );
    setActionLoading(false);

    if (res.success) {
      setActionSuccess(`Ward "${newWardName}" created successfully!`);
      setNewWardName("");
      setNewWardId("");
      setShowAddModal(false);
      void loadData();
    } else {
      setActionError(res.error || "Failed to create ward.");
    }
  };

  const handleUpdateWard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWard) return;
    setActionError("");
    setActionSuccess("");

    if (!editName.trim()) {
      setActionError("Ward name cannot be empty.");
      return;
    }

    const wId = editingWard.wardId || editingWard.id || "";
    setActionLoading(true);
    const res = await updateWardAction(wId, { name: editName }, session);
    setActionLoading(false);

    if (res.success) {
      setActionSuccess(`Ward updated successfully!`);
      setEditingWard(null);
      void loadData();
    } else {
      setActionError(res.error || "Failed to update ward.");
    }
  };

  const handleDeleteWard = async (ward: Ward) => {
    const wId = ward.wardId || ward.id || "";
    if (
      !confirm(
        `Are you sure you want to delete "${ward.name}" (${wId})?\nThis will remove all beds and form configurations for this ward.`
      )
    ) {
      return;
    }

    setActionLoading(true);
    const res = await deleteWardAction(wId, session);
    setActionLoading(false);

    if (res.success) {
      setActionSuccess(`Ward "${ward.name}" deleted.`);
      void loadData();
    } else {
      alert(res.error || "Failed to delete ward.");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ward Management</h1>
            <p className="text-sm text-slate-600">
              Add, edit, or remove wards & customize ward registration forms
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Admins & Sub-Admins Control
          </div>

          <button
            onClick={() => {
              setActionError("");
              setActionSuccess("");
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add New Ward
          </button>
        </div>
      </div>

      {/* Success / Error Banners */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {actionSuccess}
          </div>
          <button onClick={() => setActionSuccess("")} className="text-emerald-700 font-bold text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Ward Search & Dropdown Selection Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center gap-4">
        {/* Search by typing name / ID */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type ward name or ID to search (e.g. Ward 3, ward-4)..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Ward Dropdown Select */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs font-semibold text-slate-600 shrink-0">
            Select Ward:
          </label>
          <div className="relative flex-1 md:flex-none min-w-48">
            <select
              value={selectedDropdownWardId}
              onChange={(e) => setSelectedDropdownWardId(e.target.value)}
              className="w-full appearance-none pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-xs"
            >
              <option value="all">All Wards ({wards.length})</option>
              {wards.map((w) => (
                <option key={w.wardId} value={w.wardId}>
                  {w.name} ({w.wardId})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {(searchQuery || selectedDropdownWardId !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedDropdownWardId("all");
              }}
              className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Ward Cards List Grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          Loading wards data...
        </div>
      ) : filteredWards.length === 0 ? (
        <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-800">No Wards Found</h3>
          <p className="text-xs text-slate-500 mt-1">
            No ward matches your search query or dropdown filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredWards.map((ward) => {
            const wId = ward.wardId || ward.id || "";
            const formFields = wardFormMap[wId] || [];
            const normalBedsCount = ward.beds?.filter((b) => b.type === "NORMAL").length || 0;
            const icuBedsCount = ward.beds?.filter((b) => b.type === "ICU").length || 0;

            return (
              <div
                key={wId}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition"
              >
                <div>
                  {/* Top Bar: Ward Name & Actions */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600 border border-teal-100">
                        <Bed className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 leading-snug">
                          {ward.name}
                        </h2>
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono text-[11px] font-semibold">
                          ID: {wId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          setEditingWard(ward);
                          setEditName(ward.name);
                        }}
                        className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition"
                        title="Edit Ward Name"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleDeleteWard(ward)}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                        title="Delete Ward"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Bed Stats Pills */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Total Beds</p>
                      <p className="text-sm font-bold text-slate-800">{ward.totalBeds || ward.beds?.length || 0}</p>
                    </div>
                    <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100 text-center">
                      <p className="text-[10px] uppercase font-bold text-emerald-600">Available</p>
                      <p className="text-sm font-bold text-emerald-800">{ward.availableBeds ?? 0}</p>
                    </div>
                    <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100 text-center">
                      <p className="text-[10px] uppercase font-bold text-amber-600">Occupied</p>
                      <p className="text-sm font-bold text-amber-800">{ward.occupiedBeds ?? 0}</p>
                    </div>
                    <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-100 text-center">
                      <p className="text-[10px] uppercase font-bold text-purple-600">ICU Beds</p>
                      <p className="text-sm font-bold text-purple-800">{icuBedsCount}</p>
                    </div>
                  </div>

                  {/* Custom Registration Form Schema Preview */}
                  <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
                    <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                      <FileText className="w-3.5 h-3.5 text-teal-600" />
                      Registration Form Custom Fields ({formFields.length})
                    </p>

                    {formFields.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        Standard core registration fields only (Patient ID, Name, Age, Condition, History, Priority).
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {formFields.map((f: WardFormField) => (
                          <span
                            key={f.id}
                            className="px-2 py-1 bg-white border border-slate-200 text-slate-700 rounded-md text-[11px] font-medium"
                          >
                            {f.label}{" "}
                            <span className="text-slate-400 font-mono">({f.type})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setFormEditingWard(ward)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 rounded-xl text-xs font-semibold transition"
                  >
                    <FileText className="w-3.5 h-3.5 text-teal-600" />
                    Customize Registration Form
                  </button>

                  <Link
                    href={`/wards/${ward.wardId}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition"
                  >
                    View Ward Bed Grid →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Add New Ward */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <Plus className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Add New Hospital Ward</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                {actionError}
              </div>
            )}

            <form onSubmit={handleCreateWard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ward Name *
                </label>
                <input
                  type="text"
                  value={newWardName}
                  onChange={(e) => {
                    setNewWardName(e.target.value);
                    if (!newWardId) {
                      setNewWardId(
                        `ward-${e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
                      );
                    }
                  }}
                  placeholder="e.g. Ward 7 - Surgical ICU"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl text-slate-900 bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ward ID / Code Slug (Optional)
                </label>
                <input
                  type="text"
                  value={newWardId}
                  onChange={(e) => setNewWardId(e.target.value)}
                  placeholder="e.g. ward-7"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl text-slate-900 bg-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Normal Beds Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={normalBeds}
                    onChange={(e) => setNormalBeds(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl text-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ICU Beds Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={icuBeds}
                    onChange={(e) => setIcuBeds(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl text-slate-900 bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !newWardName.trim()}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition disabled:bg-teal-300"
                >
                  {actionLoading ? "Creating..." : "Create Ward"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Ward Name */}
      {editingWard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Edit Ward Details ({editingWard.wardId})
              </h3>
              <button
                onClick={() => setEditingWard(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                {actionError}
              </div>
            )}

            <form onSubmit={handleUpdateWard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ward Display Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl text-slate-900 bg-white"
                  required
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingWard(null)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !editName.trim()}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition disabled:bg-teal-300"
                >
                  {actionLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Ward Form Schema Editor Modal */}
      {formEditingWard && (
        <WardFormEditorModal
          wardId={formEditingWard.wardId || formEditingWard.id || ""}
          wardName={formEditingWard.name}
          isOpen={Boolean(formEditingWard)}
          onClose={() => setFormEditingWard(null)}
          onSaved={() => void loadData()}
        />
      )}
    </div>
  );
}
