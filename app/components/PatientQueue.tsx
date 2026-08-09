"use client";

import { useEffect, useState } from "react";
import { Sparkles, AlertCircle } from "lucide-react";
import type { Bed, Patient, Ward } from "@/app/types";
import AssignFromQueueModal from "./AssignFromQueueModal";
import PatientFeatureContributionModal from "./PatientFeatureContributionModal";
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

function getPatientExplanationWithPercentages(
  patient: Patient,
  patientReasonById: Record<string, string> = {},
  nowMs: number = Date.now()
): string {
  const existingReason =
    patient.queueReason ||
    patientReasonById[patient._id || patient.id] ||
    patientReasonById[patient.id] ||
    patientReasonById[patient._id || ""];

  if (existingReason) {
    return existingReason;
  }

  const triageNum =
    typeof patient.priority === "string"
      ? parseInt(patient.priority.replace(/\D/g, ""), 10) || 5
      : 5;

  let waitMinutes = 0;
  if (
    typeof patient.queueWaitTime === "number" &&
    Number.isFinite(patient.queueWaitTime)
  ) {
    waitMinutes = Math.max(0, patient.queueWaitTime);
  } else if (patient.admissionTime) {
    const arrivalMs = new Date(patient.admissionTime).getTime();
    if (!Number.isNaN(arrivalMs)) {
      waitMinutes = Math.max(0, (nowMs - arrivalMs) / 60_000);
    }
  }

  const waitHours = waitMinutes / 60;
  const wt = 0.6;
  const ww = 0.4;

  const urgencyContrib = (6 - triageNum) * wt;
  const waitContrib = waitHours * ww;
  const totalScore = urgencyContrib + waitContrib;

  if (totalScore <= 0) {
    return `Triage ${triageNum} urgency (50% of score), with 0.0h waiting (50%).`;
  }

  const urgencyPct = Math.round((urgencyContrib / totalScore) * 100);
  const waitPct = 100 - urgencyPct;

  if (urgencyPct >= waitPct) {
    return `Ranked mainly due to Triage ${triageNum} urgency (${urgencyPct}% of score), with ${waitHours.toFixed(
      1
    )}h waiting adding the rest (${waitPct}%).`;
  }

  return `Ranked mainly due to ${waitHours.toFixed(
    1
  )}h waiting (${waitPct}% of score), with Triage ${triageNum} urgency adding the rest (${urgencyPct}%).`;
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
  const [selectedExplanationPatient, setSelectedExplanationPatient] =
    useState<Patient | null>(null);

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

  const handleSaveTriage = async (
    patient: Patient,
    priorityToSave?: Patient["priority"]
  ) => {
    const patientKey = getPatientKey(patient);
    const nextPriority = priorityToSave || resolveTriageDraft(patient);

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

  const sortedPatients =
    queueOrderStrategy === "priority"
      ? [...patients].sort((a, b) => {
          const rankA = resolvePriorityRank(a.priority);
          const rankB = resolvePriorityRank(b.priority);
          if (rankA !== rankB) {
            return rankA - rankB;
          }
          const waitA = resolveWaitMinutes(a) ?? 0;
          const waitB = resolveWaitMinutes(b) ?? 0;
          return waitB - waitA;
        })
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
              const patientKey = getPatientKey(patient);
              const patientReason = getPatientExplanationWithPercentages(
                patient,
                patientReasonById,
                now
              );

              return (
            <div
              key={patient.id}
              onClick={() => handlePatientClick(patient)}
              className={`border-l-4 rounded-lg p-3.5 ${resolvePriorityClass(
                patient.priority
              )} ${
                wardId && beds.length > 0 && canAssign
                  ? "cursor-pointer hover:shadow-lg transition-shadow"
                  : ""
              }`}
            >
              {/* Header Row: Name & Badges on Left, Interactive Triage Button/Selector on Right */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold flex items-center gap-1.5 flex-wrap text-slate-900">
                    <span>{index + 1}. {patient.name}</span>
                    <span className="text-xs font-mono font-semibold text-slate-500 bg-white/80 px-1.5 py-0.5 rounded ring-1 ring-black/5">
                      #{patient.id}
                    </span>
                  </p>
                  <p className="text-sm flex flex-wrap gap-1.5 mt-1">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${ageGroupBadgeColors[patient.ageGroup]}`}
                    >
                      {patient.ageGroup} ({patient.age}y)
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200">
                      {patient.disease}
                    </span>
                    {patient.previousDiseases && patient.previousDiseases.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800" title={`Previous history: ${patient.previousDiseases.join(", ")}`}>
                        History: {patient.previousDiseases.slice(0, 2).join(", ")}{patient.previousDiseases.length > 2 ? "..." : ""}
                      </span>
                    )}
                    {patient.triageRequested && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-200 text-amber-900 animate-pulse">
                        Doctor Triage Needed
                      </span>
                    )}
                  </p>
                </div>

                {/* Triage Level Display / Edit Button */}
                {triageEditable ? (
                  <div
                    className="relative shrink-0 flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                    title="Click to edit patient triage level"
                  >
                    <select
                      value={resolveTriageDraft(patient)}
                      disabled={isUpdatingTriageId === patientKey}
                      onChange={async (e) => {
                        const nextPriority = e.target.value as Patient["priority"];
                        handleTriageDraftChange(patientKey, nextPriority);
                        await handleSaveTriage(patient, nextPriority);
                      }}
                      className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-bold shadow-2xs transition-all focus:outline-none focus:ring-2 ${
                        patient.triageRequested
                          ? "border-amber-400 bg-amber-100 text-amber-950 ring-amber-400 animate-pulse"
                          : "border-slate-300 bg-white/95 text-slate-900 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      <option value="Triage 1">Triage 1 (Critical)</option>
                      <option value="Triage 2">Triage 2 (Emergent)</option>
                      <option value="Triage 3">Triage 3 (Urgent)</option>
                      <option value="Triage 4">Triage 4 (Semi-urgent)</option>
                      <option value="Triage 5">Triage 5 (Non-urgent)</option>
                    </select>
                    {isUpdatingTriageId === patientKey && (
                      <span className="text-[10px] text-slate-500 font-semibold animate-pulse">
                        Saving...
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="whitespace-nowrap shrink-0 self-start text-center text-xs font-bold px-2.5 py-1 rounded-md bg-white/90 text-slate-900 ring-1 ring-black/10 shadow-2xs">
                    {patient.priority}
                  </span>
                )}
              </div>

              {/* Full Width Explanation Card */}
              <div className="mt-2.5 flex w-full items-center justify-between gap-1.5 rounded-md bg-white/85 px-2.5 py-1.5 ring-1 ring-black/5 shadow-2xs">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700 font-medium">
                    {renderReasonText(patientReason)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedExplanationPatient({
                      ...patient,
                      queueRank: index + 1,
                      queueReason: patientReason,
                    });
                  }}
                  className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-white hover:bg-amber-600 hover:scale-110 transition-all shadow-xs cursor-pointer"
                  title="View XAI Feature Contribution Breakdown"
                >
                  !
                </button>
              </div>

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

      {selectedExplanationPatient && (
        <PatientFeatureContributionModal
          patient={selectedExplanationPatient}
          wardId={wardId}
          wardName={wardName}
          isOpen={Boolean(selectedExplanationPatient)}
          onClose={() => setSelectedExplanationPatient(null)}
        />
      )}
    </div>
  );
}
