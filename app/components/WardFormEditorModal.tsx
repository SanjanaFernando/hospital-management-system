"use client";

import { useState, useEffect } from "react";
import { WardFormField, WardFieldType } from "@/app/types";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canManageStaff } from "@/lib/rbac";
import {
  getWardFormConfig,
  updateWardFormConfig,
  resetWardFormConfig,
} from "@/app/actions/wardFormActions";
import {
  Settings2,
  Plus,
  Trash2,
  X,
  Save,
  RotateCcw,
  Check,
  AlertCircle,
  FileEdit,
  Sparkles,
  Lock,
} from "lucide-react";

interface WardFormEditorModalProps {
  wardId: string;
  wardName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function WardFormEditorModal({
  wardId,
  wardName = wardId,
  isOpen,
  onClose,
  onSaved,
}: WardFormEditorModalProps) {
  const { session } = useAuthSession();
  const isAdminOrSubAdmin = canManageStaff(session);

  const [fields, setFields] = useState<WardFormField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // New field state
  const [showAddField, setShowAddField] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<WardFieldType>("text");
  const [newRequired, setNewRequired] = useState(false);
  const [newPlaceholder, setNewPlaceholder] = useState("");
  const [newOptionsText, setNewOptionsText] = useState("");

  useEffect(() => {
    if (isOpen && wardId) {
      setIsLoading(true);
      setMessage(null);
      getWardFormConfig(wardId)
        .then((fetchedFields) => {
          setFields(fetchedFields);
        })
        .catch((err) => {
          console.error(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, wardId]);

  if (!isOpen) return null;

  const handleAddField = () => {
    if (!newLabel.trim()) return;

    const slugId =
      newLabel
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `custom_${Date.now()}`;

    const options =
      newType === "select"
        ? newOptionsText
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;

    const newFieldObj: WardFormField = {
      id: slugId,
      label: newLabel.trim(),
      type: newType,
      required: newRequired,
      placeholder: newPlaceholder.trim() || undefined,
      options,
    };

    setFields((prev) => [...prev, newFieldObj]);

    // Reset new field inputs
    setNewLabel("");
    setNewType("text");
    setNewRequired(false);
    setNewPlaceholder("");
    setNewOptionsText("");
    setShowAddField(false);
  };

  const handleRemoveField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleRequired = (index: number) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, required: !f.required } : f))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    const result = await updateWardFormConfig(wardId, fields, session);
    setIsSaving(false);

    if (result.success) {
      setMessage({
        type: "success",
        text: `Registration form for ${wardName} saved successfully!`,
      });
      onSaved?.();
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setMessage({
        type: "error",
        text: result.error || "Failed to save form configuration.",
      });
    }
  };

  const handleClearAll = async () => {
    if (!confirm(`Clear all custom registration fields for ${wardName}?`)) return;
    setFields([]);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-blue-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Register New Patient ({wardName})
                </h2>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full border border-blue-200">
                  ✏️ Form Edit Mode
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Live Registration Form Editor for Admins & Sub Admins
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body Container */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">
          {!isAdminOrSubAdmin ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              Only Admins and Sub-Admins can edit ward registration form schemas.
            </div>
          ) : isLoading ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              Loading ward registration form preview...
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-xs p-6 border border-slate-200 space-y-6">
              {message && (
                <div
                  className={`p-3.5 rounded-xl border text-sm flex items-center gap-2 ${
                    message.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  {message.type === "success" ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  {message.text}
                </div>
              )}

              {/* Patient ID (Core Field Preview) */}
              <div className="relative opacity-80">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Patient ID (Numeric) *
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Core Mandatory Field
                  </span>
                </div>
                <input
                  type="text"
                  disabled
                  value="10024"
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-black bg-gray-50 text-xs font-mono font-bold"
                />
              </div>

              {/* Patient Name (Core Field Preview) */}
              <div className="relative opacity-80">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Patient Name *
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Core Mandatory Field
                  </span>
                </div>
                <input
                  type="text"
                  disabled
                  placeholder="Patient Full Name"
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-black bg-gray-50 text-xs"
                />
              </div>

              {/* Age (Core Field Preview) */}
              <div className="relative opacity-80">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Age (years) *
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Core Mandatory Field
                  </span>
                </div>
                <input
                  type="number"
                  disabled
                  placeholder="e.g. 45"
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-black bg-gray-50 text-xs"
                />
              </div>

              {/* Current Condition (Core Field Preview) */}
              <div className="relative opacity-80">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Current Disease/Condition *
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Core Mandatory Field
                  </span>
                </div>
                <select
                  disabled
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-black bg-gray-50 text-xs"
                >
                  <option>Hypertension</option>
                </select>
              </div>

              {/* ========================================================= */}
              {/* DYNAMIC WARD CUSTOM FIELDS EDIT SECTION */}
              {/* ========================================================= */}
              <div className="bg-teal-50/60 border-2 border-dashed border-teal-300 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-teal-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-teal-600" />
                      Ward Specific Details ({wardId.toUpperCase()})
                    </h3>
                    <p className="text-[11px] text-teal-700">
                      These custom fields will appear directly on the patient registration form for {wardName}.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddField(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition shadow-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Custom Field
                  </button>
                </div>

                {/* Add Field Box */}
                {showAddField && (
                  <div className="bg-white border border-teal-300 rounded-xl p-4 space-y-3 shadow-md animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-teal-900">
                        New Registration Field Config
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowAddField(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Field Label *
                        </label>
                        <input
                          type="text"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          placeholder="e.g. Blood Group"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Field Type *
                        </label>
                        <select
                          value={newType}
                          onChange={(e) => setNewType(e.target.value as WardFieldType)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-900"
                        >
                          <option value="text">Text Input</option>
                          <option value="select">Dropdown Select</option>
                          <option value="number">Number Input</option>
                          <option value="checkbox">Checkbox (Yes/No)</option>
                          <option value="textarea">Textarea (Multi-line)</option>
                          <option value="date">Date Picker</option>
                        </select>
                      </div>

                      {newType === "select" && (
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Dropdown Options (Comma-separated) *
                          </label>
                          <input
                            type="text"
                            value={newOptionsText}
                            onChange={(e) => setNewOptionsText(e.target.value)}
                            placeholder="e.g. A+, A-, B+, B-, O+, O-, AB+, AB-"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-900"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Placeholder (Optional)
                        </label>
                        <input
                          type="text"
                          value={newPlaceholder}
                          onChange={(e) => setNewPlaceholder(e.target.value)}
                          placeholder="e.g. Select blood group"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-900"
                        />
                      </div>

                      <div className="flex items-center pt-3">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newRequired}
                            onChange={(e) => setNewRequired(e.target.checked)}
                            className="rounded text-teal-600 focus:ring-teal-500"
                          />
                          Required Field
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleAddField}
                        disabled={!newLabel.trim()}
                        className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition disabled:bg-teal-300"
                      >
                        Insert into Form
                      </button>
                    </div>
                  </div>
                )}

                {/* Custom Fields Rendered Live */}
                {fields.length === 0 ? (
                  <div className="py-6 text-center text-xs text-teal-800/60 italic bg-white/60 border border-teal-200/50 rounded-xl">
                    No ward-specific custom fields. Click "+ Add Custom Field" above to add fields like Blood Group, Past Surgeries, Fasting Hours, etc.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {fields.map((field, idx) => (
                      <div
                        key={field.id + idx}
                        className={`bg-white p-3.5 border border-teal-200 rounded-xl space-y-2 relative group shadow-xs ${
                          field.type === "textarea" ? "sm:col-span-2" : ""
                        }`}
                      >
                        {/* Action Bar Header above each field */}
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">
                              {field.label} {field.required && <span className="text-red-500">*</span>}
                            </span>
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-mono uppercase">
                              {field.type}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleRequired(idx)}
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition ${
                                field.required
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {field.required ? "Required" : "Optional"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveField(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                              title="Delete Field"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Field Input Preview */}
                        <div>
                          {field.type === "text" && (
                            <input
                              type="text"
                              disabled
                              placeholder={field.placeholder || `Enter ${field.label}`}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-500"
                            />
                          )}

                          {field.type === "number" && (
                            <input
                              type="number"
                              disabled
                              placeholder={field.placeholder || `Enter ${field.label}`}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-500"
                            />
                          )}

                          {field.type === "select" && (
                            <select
                              disabled
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-500"
                            >
                              <option>{field.placeholder || `-- Select ${field.label} --`}</option>
                              {field.options?.map((opt) => (
                                <option key={opt}>{opt}</option>
                              ))}
                            </select>
                          )}

                          {field.type === "checkbox" && (
                            <label className="flex items-center gap-2 cursor-not-allowed opacity-75 pt-1">
                              <input type="checkbox" disabled className="rounded text-teal-600" />
                              <span className="text-xs text-slate-600 font-medium">Yes / Confirmed</span>
                            </label>
                          )}

                          {field.type === "textarea" && (
                            <textarea
                              disabled
                              rows={2}
                              placeholder={field.placeholder || `Enter ${field.label}`}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-500"
                            />
                          )}

                          {field.type === "date" && (
                            <input
                              type="date"
                              disabled
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-500"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority Preview */}
              <div className="relative opacity-80">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Priority Level *
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Core Mandatory Field
                  </span>
                </div>
                <select disabled className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-black bg-gray-50 text-xs">
                  <option>Triage 5 (Non-Urgent)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={isSaving || fields.length === 0 || !isAdminOrSubAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 rounded-xl hover:bg-red-50 transition disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Custom Fields
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isAdminOrSubAdmin}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:bg-blue-300 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Saving Form..." : "Save Registration Form"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
