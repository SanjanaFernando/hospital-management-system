"use client";

import { useEffect, useState } from "react";
import { Bed, Patient } from "@/app/types";
import {
  assignPatientToBed,
  forceAssignPatientToBed,
} from "@/app/actions/patientActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canSetTriage } from "@/lib/rbac";
import { updatePatient } from "@/app/utils/api";

interface AssignPatientModalProps {
  wardId: string;
  bed: Bed;
  queue: Patient[];
  onAssigned: () => void;
  onTriageUpdated?: () => void;
  onCancel: () => void;
}

/** Returns true when patient gender conflicts with the bed's designated gender */
function hasGenderMismatch(bed: Bed, patient: Patient | undefined): boolean {
  if (!patient) return false;
  const bedGender = bed.gender ?? "Unisex";
  if (bedGender === "Unisex") return false;
  if (!patient.gender) return false;
  return patient.gender !== bedGender;
}

export default function AssignPatientModal({
  wardId,
  bed,
  queue,
  onAssigned,
  onTriageUpdated,
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
  const genderMismatch = hasGenderMismatch(bed, selectedPatient);
  const bedGenderLabel = bed.gender && bed.gender !== "Unisex" ? bed.gender : "";

  useEffect(() => {
    setTriageDraft(selectedPatient?.priority || null);
    setIsEditingTriage(false);
    setTriageError("");
    setErrorMessage("");
  }, [selectedPatient?.id, selectedPatient?.priority]);

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
          triageRequested: false,
        },
        session
      );

      setIsEditingTriage(false);
      (onTriageUpdated || onAssigned)();
    } catch (error) {
      setTriageError(
        error instanceof Error ? error.message : "Failed to update triage"
      );
    } finally {
      setIsUpdatingTriage(false);
    }
  };

  const handleAssign = async (force = false) => {
    if (!selectedPatientId) {
      setErrorMessage("Please select a patient from the queue");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      if (force) {
        await forceAssignPatientToBed({
          wardId,
          bedId: bed.id,
          patientId: selectedPatientId,
          actor: session,
        });
      } else {
        await assignPatientToBed({
          wardId,
          bedId: bed.id,
          patientId: selectedPatientId,
          actor: session,
        });
      }
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
            {bedGenderLabel && (
              <span
                className={`ml-2 text-sm font-semibold px-2 py-0.5 rounded-full ${
                  bed.gender === "Male"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-pink-100 text-pink-700"
                }`}
              >
                {bed.gender === "Male" ? "♂" : "♀"} {bed.gender}
              </span>
            )}
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
                  {patient.gender ? ` (${patient.gender})` : ""}
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
                  {selectedPatient.gender && (
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        selectedPatient.gender === "Male"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-pink-100 text-pink-700"
                      }`}
                    >
                      {selectedPatient.gender === "Male" ? "♂" : "♀"}{" "}
                      {selectedPatient.gender}
                    </span>
                  )}
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

            {/* Gender mismatch warning */}
            {genderMismatch && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
                <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">Gender mismatch:</span> This
                  bed is designated for{" "}
                  <span className="font-semibold">{bed.gender}</span> patients.
                  Normal assignment is blocked. Use{" "}
                  <span className="font-semibold">Force Assign</span> to
                  override.
                </p>
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
              {!genderMismatch ? (
                <button
                  onClick={() => handleAssign(false)}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-white font-semibold hover:bg-green-700 disabled:bg-green-300"
                >
                  {isLoading ? "Assigning..." : "Assign Patient"}
                </button>
              ) : (
                <button
                  onClick={() => handleAssign(true)}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-white font-semibold hover:bg-amber-700 disabled:bg-amber-300"
                >
                  {isLoading ? "Assigning..." : "⚠ Force Assign"}
                </button>
              )}
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
