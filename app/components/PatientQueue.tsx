"use client";

import { useState } from "react";
import { Patient, Bed } from "@/app/types";
import AssignFromQueueModal from "./AssignFromQueueModal";

interface PatientQueueProps {
  patients: Patient[];
  beds?: Bed[];
  wardId?: string;
  wardName?: string;
  onPatientAssigned?: () => void;
}

const priorityColors = {
  Critical: "bg-red-100 border-red-500 text-red-800",
  Urgent: "bg-orange-100 border-orange-500 text-orange-800",
  "Non-urgent": "bg-blue-100 border-blue-500 text-blue-800",
};

const ageGroupBadgeColors = {
  Child: "bg-purple-100 text-purple-800",
  Adult: "bg-green-100 text-green-800",
  Elderly: "bg-pink-100 text-pink-800",
};

export default function PatientQueue({
  patients = [],
  beds = [],
  wardId = "",
  wardName = "",
  onPatientAssigned,
}: PatientQueueProps) {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

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

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">
        Patient Queue ({patients.length})
      </h3>
      {wardId && beds.length > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          💡 Click on a patient to assign them to a bed
        </p>
      )}
      <div className="space-y-3 max-h-[65vh] overflow-y-auto">
        {patients.map((patient, index) => (
          <div
            key={patient.id}
            onClick={() => handlePatientClick(patient)}
            className={`border-l-4 rounded-lg p-4 ${priorityColors[patient.priority]} ${
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
            {patient.queueWaitTime && (
              <p className="text-xs mt-1 font-semibold">
                Waiting: {patient.queueWaitTime} mins
              </p>
            )}
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
