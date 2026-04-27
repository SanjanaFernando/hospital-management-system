"use client";

import { useState } from "react";
import { Patient } from "@/app/types";
import DischargePatient from "./DischargePatient";
import { movePatientToQueue } from "@/app/actions/patientActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";

interface PatientDetailProps {
  patient: Patient;
  onDischargeSuccess?: () => void;
  onMoveToQueueSuccess?: () => void;
  canManageActions?: boolean;
}

const priorityColors = {
  "Triage 1": "bg-red-500",
  "Triage 2": "bg-orange-500",
  "Triage 3": "bg-yellow-500",
  "Triage 4": "bg-lime-500",
  "Triage 5": "bg-blue-500",
};

const ageGroupColors = {
  Child: "bg-purple-500",
  Adult: "bg-green-500",
  Elderly: "bg-pink-500",
};

export default function PatientDetail({
  patient,
  onDischargeSuccess,
  onMoveToQueueSuccess,
  canManageActions = true,
}: PatientDetailProps) {
  const { session } = useAuthSession();
  const [showDischargeForm, setShowDischargeForm] = useState(false);
  const [isMovingToQueue, setIsMovingToQueue] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const admissionDate = patient.admissionTime
    ? new Date(patient.admissionTime)
    : null;
  const currentDate = new Date();
  const daysAdmitted = admissionDate
    ? Math.floor(
        (currentDate.getTime() - admissionDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  const handleMoveToQueue = async () => {
    setErrorMessage("");
    setIsMovingToQueue(true);

    try {
      await movePatientToQueue(patient.id, session);
      onMoveToQueueSuccess?.();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to move patient to queue"
      );
    } finally {
      setIsMovingToQueue(false);
    }
  };

  if (showDischargeForm) {
    return (
      <DischargePatient
        patientId={patient.id}
        patientName={patient.name}
        onSuccess={() => onDischargeSuccess?.()}
        onCancel={() => setShowDischargeForm(false)}
      />
    );
  }

  return (
    <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-2xl font-bold text-gray-800">{patient.name}</h3>
          <p className="text-gray-600 text-sm">Patient ID: {patient.id}</p>
        </div>
        <div className="flex gap-2">
          <span
            className={`${priorityColors[patient.priority]} text-white px-3 py-1 rounded-full text-sm font-semibold`}
          >
            {patient.priority}
          </span>
          <span
            className={`${ageGroupColors[patient.ageGroup]} text-white px-3 py-1 rounded-full text-sm font-semibold`}
          >
            {patient.ageGroup}
          </span>
          {canManageActions && (
            <>
              <button
                onClick={handleMoveToQueue}
                disabled={isMovingToQueue}
                className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-semibold hover:bg-orange-600 transition-colors disabled:bg-orange-300 disabled:cursor-not-allowed"
              >
                {isMovingToQueue ? "Moving..." : "Move to Queue"}
              </button>
              <button
                onClick={() => setShowDischargeForm(true)}
                className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold hover:bg-red-600 transition-colors"
              >
                Discharge
              </button>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 text-sm">{errorMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded p-3 border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Age</p>
          <p className="text-lg font-semibold text-gray-800">
            {patient.age} years
          </p>
        </div>
        <div className="bg-white rounded p-3 border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Disease/Condition</p>
          <p className="text-lg font-semibold text-gray-800">
            {patient.disease}
          </p>
        </div>
        {admissionDate && (
          <div className="bg-white rounded p-3 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Admission Date & Time</p>
            <p className="text-sm font-semibold text-gray-800">
              {admissionDate.toLocaleString()}
            </p>
          </div>
        )}
        {admissionDate && (
          <div className="bg-white rounded p-3 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Days in Hospital</p>
            <p className="text-lg font-semibold text-gray-800">
              {daysAdmitted} day(s)
            </p>
          </div>
        )}
        {patient.queueWaitTime && (
          <div className="bg-white rounded p-3 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Queue Wait Time</p>
            <p className="text-lg font-semibold text-gray-800">
              {patient.queueWaitTime} min(s)
            </p>
          </div>
        )}
      </div>

      {patient.specialRequirements &&
        patient.specialRequirements.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <p className="text-sm font-semibold text-yellow-800 mb-2">
              Special Requirements
            </p>
            <div className="flex flex-wrap gap-2">
              {patient.specialRequirements.map((req, index) => (
                <span
                  key={index}
                  className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium"
                >
                  {req}
                </span>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
