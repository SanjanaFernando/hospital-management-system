"use client";

import { useEffect, useState } from "react";
import { Patient, Bed, Ward } from "@/app/types";
import AssignFromQueueModal from "./AssignFromQueueModal";
import { updatePatient } from "@/app/utils/api";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canSetTriage } from "@/lib/rbac";

interface PatientQueueProps {
  patients: Patient[];
  beds?: Bed[];
  wards?: Ward[];
  wardId?: string;
  wardName?: string;
  onPatientAssigned?: () => void;
  queueOrderStrategy?: "ai" | "priority";
  queueOrderMessage?: string;
  patientReasonById?: Record<string, string>;
  canAssign?: boolean;
  listMaxHeight?: number;
}

const priorityColors = {
  "Triage 1": "bg-red-100 border-red-500 text-red-800",
  "Triage 2": "bg-orange-100 border-orange-500 text-orange-800",
  "Triage 3": "bg-yellow-100 border-yellow-500 text-yellow-800",
  "Triage 4": "bg-lime-100 border-lime-500 text-lime-800",
  "Triage 5": "bg-blue-100 border-blue-500 text-blue-800",
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
  const rank = resolvePriorityRank(priority);
  if (rank === 0) return priorityColors["Triage 1"];
  if (rank === 1) return priorityColors["Triage 2"];
  if (rank === 2) return priorityColors["Triage 3"];
  if (rank === 3) return priorityColors["Triage 4"];
  if (rank === 4) return priorityColors["Triage 5"];

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
  queueOrderMessage = "",
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

  const triageEditable = Boolean(wardId) && canSetTriage(session, wardId);

  const resolveTriageDraft = (patient: Patient): Patient["priority"] => {
    return triageDraftByPatient[patient.id] || patient.priority;
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
    const nextPriority = resolveTriageDraft(patient);
    const targetPatientId = patient._id || patient.id;

    setTriageError("");
    setIsUpdatingTriageId(patient.id);

    try {
      await updatePatient(
        targetPatientId,
        { priority: nextPriority, triageRequested: false },
        session
      );
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

      {queueOrderMessage && (
        <p className="text-xs text-blue-700 mb-3">{queueOrderMessage}</p>
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
                  <p className="font-semibold">
                    {index + 1}. {patient.name}
                  </p>
                  <p className="text-sm flex gap-2 mt-1">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${ageGroupBadgeColors[patient.ageGroup]}`}
                    >
                      {patient.ageGroup} ({patient.age}y)
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200">
                      {patient.disease}
                    </span>
                    {patient.triageRequested && (
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-200 text-amber-900">
                        Pending Triage
                      </span>
                    )}
                  </p>
                  {patientReason && (
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      {patientReason}
                    </p>
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
                      disabled={isUpdatingTriageId === patient.id}
                      className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:bg-amber-300"
                    >
                      {isUpdatingTriageId === patient.id ? "Saving..." : "Save"}
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
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
