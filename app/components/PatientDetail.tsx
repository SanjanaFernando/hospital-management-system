"use client";

import { useState } from "react";
import { Patient } from "@/app/types";
import DischargePatient from "./DischargePatient";
import { movePatientToQueue } from "@/app/actions/patientActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canSetTriage } from "@/lib/rbac";
import { updatePatient } from "@/app/utils/api";

interface PatientDetailProps {
  patient: Patient;
  onDischargeSuccess?: () => void;
  onMoveToQueueSuccess?: () => void;
  onPatientUpdated?: () => void;
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

const formatWardLabel = (wardId?: string | null) => {
  if (!wardId) {
    return "";
  }

  const normalized = wardId.toUpperCase().replace("WARD-", "Ward ");
  return normalized.startsWith("Ward ") ? normalized : wardId;
};

export default function PatientDetail({
  patient,
  onDischargeSuccess,
  onMoveToQueueSuccess,
  onPatientUpdated,
  canManageActions = true,
}: PatientDetailProps) {
  const { session } = useAuthSession();
  const [showDischargeForm, setShowDischargeForm] = useState(false);
  const [isMovingToQueue, setIsMovingToQueue] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isEditingTriage, setIsEditingTriage] = useState(false);
  const [triageDraft, setTriageDraft] = useState<Patient["priority"]>(
    patient.priority
  );
  const [isUpdatingTriage, setIsUpdatingTriage] = useState(false);
  const [triageError, setTriageError] = useState("");

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

  const handleSaveTriage = async () => {
    const targetPatientId = patient._id || patient.id;

    setTriageError("");
    setIsUpdatingTriage(true);

    try {
      await updatePatient(
        targetPatientId,
        {
          priority: triageDraft,
        },
        session
      );

      setIsEditingTriage(false);
      onPatientUpdated?.();
    } catch (error) {
      setTriageError(
        error instanceof Error ? error.message : "Failed to update triage"
      );
    } finally {
      setIsUpdatingTriage(false);
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

  const canEditTriage =
    Boolean(patient.wardId) && canSetTriage(session, patient.wardId || "");

  return (
    <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-2xl font-bold text-gray-800">{patient.name}</h3>
          <p className="text-gray-600 text-sm">Patient ID: {patient.id}</p>
        </div>
        <div className="flex gap-2">
          {!isEditingTriage ? (
            <span
              onClick={() => canEditTriage && setIsEditingTriage(true)}
              className={`${priorityColors[patient.priority]} text-white px-3 py-1 rounded-full text-sm font-semibold ${
                canEditTriage
                  ? "cursor-pointer hover:opacity-80 transition-opacity"
                  : ""
              }`}
            >
              {patient.priority}
            </span>
          ) : (
            <div className="flex gap-2">
              <select
                value={triageDraft}
                onChange={(e) =>
                  setTriageDraft(e.target.value as Patient["priority"])
                }
                className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900"
              >
                <option value="Triage 1">Triage 1</option>
                <option value="Triage 2">Triage 2</option>
                <option value="Triage 3">Triage 3</option>
                <option value="Triage 4">Triage 4</option>
                <option value="Triage 5">Triage 5</option>
              </select>
              <button
                type="button"
                onClick={handleSaveTriage}
                disabled={isUpdatingTriage || triageDraft === patient.priority}
                className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors"
              >
                {isUpdatingTriage ? "..." : "✓"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditingTriage(false);
                  setTriageDraft(patient.priority);
                  setTriageError("");
                }}
                disabled={isUpdatingTriage}
                className="rounded bg-gray-400 px-3 py-1 text-sm font-semibold text-white hover:bg-gray-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                ✕
              </button>
            </div>
          )}
          <span
            className={`${ageGroupColors[patient.ageGroup]} text-white px-3 py-1 rounded-full text-sm font-semibold`}
          >
            {patient.ageGroup}
          </span>
          {patient.assignedFromWardId && patient.assignedFromWardId !== patient.wardId && (
            <span className="bg-cyan-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
              From {formatWardLabel(patient.assignedFromWardId)}
            </span>
          )}
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

      {triageError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 text-sm">{triageError}</p>
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

      {patient.previousDiseases && patient.previousDiseases.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded p-4 mb-4">
          <p className="text-sm font-semibold text-purple-900 mb-2">
            Previous Diseases / Medical History
          </p>
          <div className="flex flex-wrap gap-2">
            {patient.previousDiseases.map((prevDis, index) => (
              <span
                key={index}
                className="bg-purple-200 text-purple-900 px-3 py-1 rounded-full text-xs font-semibold"
              >
                {prevDis}
              </span>
            ))}
          </div>
        </div>
      )}

      {patient.customFields && Object.keys(patient.customFields).length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4">
          <p className="text-sm font-semibold text-slate-800 mb-2">
            Ward Specific Details
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(patient.customFields).map(([k, v]) => (
              <div key={k} className="bg-white p-2 rounded border border-slate-200">
                <span className="font-semibold text-slate-700 capitalize">
                  {k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}:
                </span>{" "}
                <span className="text-slate-900">{typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
