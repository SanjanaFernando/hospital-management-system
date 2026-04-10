"use client";

import { useEffect, useState } from "react";
import { Patient, Bed } from "@/app/types";
import AssignFromQueueModal from "./AssignFromQueueModal";

interface PatientQueueProps {
  patients: Patient[];
  beds?: Bed[];
  wardId?: string;
  wardName?: string;
  onPatientAssigned?: () => void;
  queueOrderStrategy?: "ai" | "priority";
  queueOrderMessage?: string;
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
  wardId = "",
  wardName = "",
  onPatientAssigned,
  queueOrderStrategy = "priority",
  queueOrderMessage = "",
}: PatientQueueProps) {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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

    if (!patient.admissionTime) {
      return null;
    }

    const arrivalMs = new Date(patient.admissionTime).getTime();
    if (Number.isNaN(arrivalMs)) {
      return null;
    }

    return Math.max(0, Math.floor((now - arrivalMs) / 60_000));
  };

  const handlePatientClick = (patient: Patient) => {
    if (wardId && beds.length > 0) {
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

  const displayPatients = hasUnknownPriority
    ? [...patients].sort(
        (a, b) =>
          resolvePriorityRank(a.priority) - resolvePriorityRank(b.priority)
      )
    : patients;

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">
        Patient Queue ({patients.length})
      </h3>
      {wardId && beds.length > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          {queueOrderStrategy === "ai"
            ? "AI-reordered queue using model and live ward data. Click a patient to assign to a bed."
            : "Priority-ordered queue. Click a patient to assign to a bed."}
        </p>
      )}
      {queueOrderMessage && (
        <p className="text-xs text-blue-700 mb-3">{queueOrderMessage}</p>
      )}
      <div className="space-y-3 max-h-[65vh] overflow-y-auto">
        {displayPatients.map((patient, index) => (
          <div
            key={patient.id}
            onClick={() => handlePatientClick(patient)}
            className={`border-l-4 rounded-lg p-4 ${resolvePriorityClass(patient.priority)} ${
              wardId && beds.length > 0
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
                </p>
              </div>
              <span className="text-xs font-bold">{patient.priority}</span>
            </div>
            {patient.admissionTime && (
              <p className="text-xs mt-2">
                Arrival: {new Date(patient.admissionTime).toLocaleString()}
              </p>
            )}
            {(() => {
              const waitMinutes = resolveWaitMinutes(patient);
              if (waitMinutes === null) {
                return null;
              }

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
        ))}
      </div>

      {showAssignModal && selectedPatient && wardId && (
        <AssignFromQueueModal
          wardId={wardId}
          wardName={wardName || `Ward ${wardId}`}
          patient={selectedPatient}
          beds={beds}
          onAssigned={handleAssignSuccess}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
