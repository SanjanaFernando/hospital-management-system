"use client";

import { useState } from "react";
import { Bed, Patient } from "@/app/types";
import { assignPatientToBed } from "@/app/actions/patientActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canSetTriage } from "@/lib/rbac";
import { updatePatient } from "@/app/utils/api";

interface AssignPatientModalProps {
  wardId: string;
  bed: Bed;
  queue: Patient[];
  onAssigned: () => void;
  onCancel: () => void;
}

export default function AssignPatientModal({
  wardId,
  bed,
  queue,
  onAssigned,
  onCancel,
}: AssignPatientModalProps) {
  const { session } = useAuthSession();
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    queue[0]?.id || ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isEditingTriage, setIsEditingTriage] = useState(false);
  const [triageDraft, setTriageDraft] = useState<Patient["priority"] | null>(
    null
  );
  const [isUpdatingTriage, setIsUpdatingTriage] = useState(false);
  const [triageError, setTriageError] = useState("");

  const selectedPatient = queue.find((p) => p.id === selectedPatientId);
  const canEditTriage = Boolean(wardId) && canSetTriage(session, wardId);

  if (!triageDraft && selectedPatient) {
    setTriageDraft(selectedPatient.priority);
  }

  const handleSaveTriage = async () => {
    if (!selectedPatient) return;

    const targetPatientId = selectedPatient._id || selectedPatient.id;

    setTriageError("");
    setIsUpdatingTriage(true);

    try {
      await updatePatient(
        targetPatientId,
        {
          priority: triageDraft!,
        },
        session
      );

      setIsEditingTriage(false);
    } catch (error) {
      setTriageError(
        error instanceof Error ? error.message : "Failed to update triage"
      );
    } finally {
      setIsUpdatingTriage(false);
    }
  };
  const handleAssign = async () => {
    if (!selectedPatientId) {
      setErrorMessage("Please select a patient from the queue");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      await assignPatientToBed({
        wardId,
        bedId: bed.id,
        patientId: selectedPatientId,
        actor: session,
      });
      onAssigned();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to assign patient";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            Assign Patient to Bed {bed.bedNumber}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {queue.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-600">No patients in queue for this ward.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-gray-700">
              Select a patient
            </label>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {queue.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} - {patient.priority}
                </option>
              ))}
            </select>

            {selectedPatient && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-gray-600 mb-2 font-semibold">
                  Patient Details:
                </p>
                <div className="flex gap-2 flex-wrap mb-3">
                  <span className="px-2 py-1 rounded text-xs text-gray-600 font-medium bg-gray-200">
                    {selectedPatient.age}y - {selectedPatient.ageGroup}
                  </span>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-orange-200 text-orange-800">
                    {selectedPatient.disease}
                  </span>
                </div>
                {triageError && (
                  <p className="text-red-700 text-xs mb-2">{triageError}</p>
                )}
                {!isEditingTriage ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600">
                      Triage:
                    </span>
                    <span
                      onClick={() => canEditTriage && setIsEditingTriage(true)}
                      className={`px-2 py-1 rounded text-xs font-medium bg-orange-200 text-orange-800 ${
                        canEditTriage
                          ? "cursor-pointer hover:opacity-80 transition-opacity"
                          : ""
                      }`}
                    >
                      {selectedPatient.priority}
                    </span>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={triageDraft || ""}
                      onChange={(e) =>
                        setTriageDraft(e.target.value as Patient["priority"])
                      }
                      className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
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
                      disabled={
                        isUpdatingTriage ||
                        triageDraft === selectedPatient.priority
                      }
                      className="rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {isUpdatingTriage ? "..." : "✓"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingTriage(false);
                        setTriageDraft(selectedPatient.priority);
                        setTriageError("");
                      }}
                      disabled={isUpdatingTriage}
                      className="rounded bg-gray-400 px-2 py-1 text-xs font-semibold text-white hover:bg-gray-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-700">
                  {errorMessage}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleAssign}
                disabled={isLoading}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-white font-semibold hover:bg-green-700 disabled:bg-green-300"
              >
                {isLoading ? "Assigning..." : "Assign Patient"}
              </button>
              <button
                onClick={onCancel}
                className="flex-1 rounded-lg bg-gray-300 px-4 py-2 text-gray-800 font-semibold hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
