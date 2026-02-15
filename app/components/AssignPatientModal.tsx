"use client";

import { useState } from "react";
import { Bed, Patient } from "@/app/types";
import { assignPatientToBed } from "@/app/actions/patientActions";

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
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    queue[0]?.id || "",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {queue.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} - {patient.priority}
                </option>
              ))}
            </select>

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
