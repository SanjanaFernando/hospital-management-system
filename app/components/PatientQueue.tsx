"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { Bed, Patient, Ward } from "@/app/types";
import AssignFromQueueModal from "./AssignFromQueueModal";
import { updatePatient } from "@/app/utils/api";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canSetTriage } from "@/lib/rbac";

const REASON_SPLIT_PATTERN = /(#\d+|\d+(?:\.\d+)?%|\d+(?:\.\d+)?h\b)/g;
const REASON_TOKEN_PATTERN = /^(#\d+|\d+(?:\.\d+)?%|\d+(?:\.\d+)?h)$/;

function renderReasonText(reason: string) {
  return reason
    .split(REASON_SPLIT_PATTERN)
    .map((part, index) =>
      REASON_TOKEN_PATTERN.test(part) ? (
        <span key={index} className="font-semibold text-slate-800">
          {part}
        </span>
      ) : (
        <span key={index}>{part}</span>
      )
    );
}

interface PatientQueueProps {
  patients: Patient[];
  beds?: Bed[];
  wards?: Ward[];
  wardId?: string;
  wardName?: string;
  onPatientAssigned?: () => void;
  queueOrderStrategy?: "ai" | "priority";
  patientReasonById?: Record<string, string>;
  canAssign?: boolean;
  listMaxHeight?: number;
}

const priorityColors: Record<string, string> = {
  "Triage 1": "bg-red-100 border-red-500 text-red-800",
  "Triage 2": "bg-orange-100 border-orange-500 text-orange-800",
  "Triage 3": "bg-yellow-100 border-yellow-500 text-yellow-800",
  "Triage 4": "bg-lime-100 border-lime-500 text-lime-800",
  "Triage 5": "bg-blue-100 border-blue-500 text-blue-800",
  // Legacy aliases — map to same color as their triage equivalent
  "Critical":   "bg-red-100 border-red-500 text-red-800",
  "Urgent":     "bg-yellow-100 border-yellow-500 text-yellow-800",
  "Non-urgent": "bg-blue-100 border-blue-500 text-blue-800",
};

const ageGroupBadgeColors = {
  Child: "bg-purple-100 text-purple-800",
  Adult: "bg-green-100 text-green-800",
  Elderly: "bg-pink-100 text-pink-800",
};

const priorityOrder = {
  "Triage 1": 0,
  "Triage 2": 1,
  "Triage 3": 2,
  "Triage 4": 3,
  "Triage 5": 4,
};

function resolvePriorityRank(priority: string): number {
  const normalized = String(priority).trim();

  if (normalized in priorityOrder) {
    return priorityOrder[normalized as keyof typeof priorityOrder];
  }

  if (normalized === "Critical") return priorityOrder["Triage 1"];
  if (normalized === "Urgent") return priorityOrder["Triage 3"];
  if (normalized === "Non-urgent") return priorityOrder["Triage 5"];

  return 99;
}

function resolvePriorityClass(priority: string): string {
  const normalized = String(priority).trim();

  // Direct lookup first — covers all Triage N and legacy Critical/Urgent/Non-urgent
  if (normalized in priorityColors) {
    return priorityColors[normalized];
  }

  // Numeric triage level fallback (e.g. priority stored as "1" or 1 in DB)
  const numMatch = normalized.match(/^(\d)$/);
  if (numMatch) {
    const level = `Triage ${numMatch[1]}`;
    if (level in priorityColors) return priorityColors[level];
  }

  return "bg-gray-100 border-gray-400 text-gray-700";
}

export default function PatientQueue({
  patients = [],
  beds = [],
  wards,
  wardId = "",
  wardName = "",
  onPatientAssigned,
  queueOrderStrategy = "priority",
  patientReasonById = {},
  canAssign = true,
  listMaxHeight,
}: PatientQueueProps) {
  const { session } = useAuthSession();
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [triageDraftByPatient, setTriageDraftByPatient] = useState<
    Record<string, Patient["priority"]>
  >({});
  const [isUpdatingTriageId, setIsUpdatingTriageId] = useState<string | null>(
    null
  );
  const [triageError, setTriageError] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const getPatientKey = (patient: Patient): string => patient._id || patient.id;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const resolveWaitMinutes = (patient: Patient): number | null => {
    if (
      typeof patient.queueWaitTime === "number" &&
      Number.isFinite(patient.queueWaitTime)
    ) {
      return Math.max(0, Math.floor(patient.queueWaitTime));
    }

    if (!patient.admissionTime) return null;

    const arrivalMs = new Date(patient.admissionTime).getTime();
    if (Number.isNaN(arrivalMs)) return null;

    return Math.max(0, Math.floor((now - arrivalMs) / 60_000));
  };

  const handlePatientClick = (patient: Patient) => {
    if (wardId && beds.length > 0 && canAssign) {
      setSelectedPatient(patient);
      setShowAssignModal(true);
    }
  };

  const handleAssignSuccess = () => {
    setShowAssignModal(false);
    setSelectedPatient(null);
    onPatientAssigned?.();
  };

  const handleModalClose = () => {
    setShowAssignModal(false);
    setSelectedPatient(null);
  };

  const handleTriageUpdated = () => {
    onPatientAssigned?.();
  };

  const triageEditable = Boolean(wardId) && canSetTriage(session, wardId);

  const resolveTriageDraft = (patient: Patient): Patient["priority"] => {
    const patientKey = getPatientKey(patient);
    return triageDraftByPatient[patientKey] || patient.priority;
  };

  const handleTriageDraftChange = (
    patientId: string,
    priority: Patient["priority"]
  ) => {
    setTriageDraftByPatient((prev) => ({
      ...prev,
      [patientId]: priority,
    }));
  };

  const handleSaveTriage = async (patient: Patient) => {
    const patientKey = getPatientKey(patient);
    const nextPriority = resolveTriageDraft(patient);

    setTriageError("");
    setIsUpdatingTriageId(patientKey);

    try {
      await updatePatient(
        patientKey,
        { priority: nextPriority, triageRequested: false },
        session
      );
      setTriageDraftByPatient((prev) => {
        const nextDraft = { ...prev };
        delete nextDraft[patientKey];
        return nextDraft;
      });
      onPatientAssigned?.();
    } catch (error) {
      setTriageError(
        error instanceof Error ? error.message : "Failed to update triage"
      );
    } finally {
      setIsUpdatingTriageId(null);
    }
  };

  if (!patients || patients.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-gray-500">No patients in queue</p>
      </div>
    );
  }

  const hasUnknownPriority = patients.some(
    (patient) => resolvePriorityRank(patient.priority) === 99
  );

  const sortedPatients = hasUnknownPriority
    ? [...patients].sort(
        (a, b) =>
          resolvePriorityRank(a.priority) - resolvePriorityRank(b.priority)
      )
    : patients;

  const displayPatients = sortedPatients;

  return (
    <div className="w-full h-full">
      {/* Header with Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          Patient Queue ({patients.length})
        </h3>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="lg:hidden flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          aria-expanded={isOpen}
        >
          {isOpen ? "Hide Queue" : "Show Queue"}
          <span
            className={`transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>
      </div>

      {wardId && beds.length > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          {!canAssign
            ? "You can view queue order, but your role cannot assign patients to beds."
            : queueOrderStrategy === "ai"
              ? "AI-reordered queue using model and live ward data. Click a patient to assign to a bed."
              : "Priority-ordered queue. Click a patient to assign to a bed."}
        </p>
      )}

      {/* Collapsible Queue Container */}
      <div
        className={`
          overflow-hidden transition-all duration-300
          ${isOpen ? "block" : "hidden lg:block"}
        `}
      >
        <div
          className="space-y-3 overflow-y-auto"
          style={
            listMaxHeight ? { maxHeight: `${listMaxHeight}px` } : undefined
          }
        >
          {displayPatients.map((patient, index) => (
            (() => {
              const patientReason =
                patient.queueReason ||
                patientReasonById[patient._id || patient.id] ||
                patientReasonById[patient.id] ||
                patientReasonById[patient._id || ""];

              return (
            <div
              key={patient.id}
              onClick={() => handlePatientClick(patient)}
              className={`border-l-4 rounded-lg p-4 ${resolvePriorityClass(
                patient.priority
              )} ${
                wardId && beds.length > 0 && canAssign
                  ? "cursor-pointer hover:shadow-lg transition-shadow"
                  : ""
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold flex items-center gap-1.5 flex-wrap">
                    <span>{index + 1}. {patient.name}</span>
                    <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      #{patient.id}
                    </span>
                  </p>
                  <p className="text-sm flex flex-wrap gap-2 mt-1">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${ageGroupBadgeColors[patient.ageGroup]}`}
                    >
                      {patient.ageGroup} ({patient.age}y)
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200">
                      {patient.disease}
                    </span>
                    {patient.previousDiseases && patient.previousDiseases.length > 0 && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800" title={`Previous history: ${patient.previousDiseases.join(", ")}`}>
                        History: {patient.previousDiseases.slice(0, 2).join(", ")}{patient.previousDiseases.length > 2 ? "..." : ""}
                      </span>
                    )}
                    {patient.triageRequested && (
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-200 text-amber-900">
                        Pending Triage
                      </span>
                    )}
                  </p>
                  {patientReason && (
                    <div className="mt-2 flex w-full items-start gap-1.5 rounded-md bg-white/70 px-2.5 py-1.5 ring-1 ring-black/5">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                      <p className="min-w-0 flex-1 break-words text-xs leading-relaxed text-slate-600">
                        {renderReasonText(patientReason)}
                      </p>
                    </div>
                  )}
                </div>
                <span className="text-xs font-bold">{patient.priority}</span>
              </div>

              {triageEditable && patient.triageRequested && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2">
                  <p className="text-xs font-semibold text-amber-900 mb-2">
                    Consultant Doctor: set triage level for this patient.
                  </p>
                  <div
                    className="flex gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <select
                      value={resolveTriageDraft(patient)}
                      onChange={(e) =>
                        handleTriageDraftChange(
                          patient.id,
                          e.target.value as Patient["priority"]
                        )
                      }
                      className="flex-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-gray-900"
                    >
                      <option value="Triage 1">Triage 1</option>
                      <option value="Triage 2">Triage 2</option>
                      <option value="Triage 3">Triage 3</option>
                      <option value="Triage 4">Triage 4</option>
                      <option value="Triage 5">Triage 5</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleSaveTriage(patient)}
                      disabled={isUpdatingTriageId === getPatientKey(patient)}
                      className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:bg-amber-300"
                    >
                      {isUpdatingTriageId === getPatientKey(patient)
                        ? "Saving..."
                        : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {patient.admissionTime && (
                <p className="text-xs mt-2">
                  Arrival: {new Date(patient.admissionTime).toLocaleString()}
                </p>
              )}

              {(() => {
                const waitMinutes = resolveWaitMinutes(patient);
                if (waitMinutes === null) return null;
                return (
                  <p className="text-xs mt-1 font-semibold">
                    Waiting: {waitMinutes} mins
                  </p>
                );
              })()}

              {patient.specialRequirements &&
                patient.specialRequirements.length > 0 && (
                  <p className="text-xs mt-2">
                    <span className="font-semibold">Special needs:</span>{" "}
                    {patient.specialRequirements.join(", ")}
                  </p>
                )}
            </div>
              );
            })()
          ))}
        </div>
      </div>

      {triageError && (
        <p className="mt-3 text-xs text-red-700">{triageError}</p>
      )}

      {showAssignModal && selectedPatient && wardId && canAssign && (
        <AssignFromQueueModal
          wardId={wardId}
          wardName={wardName || `Ward ${wardId}`}
          patient={selectedPatient}
          beds={beds}
          wards={wards}
          onAssigned={handleAssignSuccess}
          onTriageUpdated={handleTriageUpdated}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
