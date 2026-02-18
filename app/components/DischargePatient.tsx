"use client";

import { useState } from "react";
import { dischargePatientById } from "@/app/actions/patientActions";

interface DischargePatientProps {
  patientId: string;
  patientName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function DischargePatient({
  patientId,
  patientName,
  onSuccess,
  onCancel,
}: DischargePatientProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [dischargeNotes, setDischargeNotes] = useState("");

  const handleDischarge = async () => {
    setErrorMessage("");
    setIsLoading(true);

    try {
      // Delete patient from database
      await dischargePatientById(patientId);

      // Call success callback
      onSuccess();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to discharge patient"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mt-6">
      <h3 className="text-lg font-bold text-red-700 mb-2">Discharge Patient</h3>
      <p className="text-sm text-gray-700 mb-4">
        Are you sure you want to discharge <strong>{patientName}</strong>?
      </p>

      {/* Discharge Notes */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Discharge Notes (Optional)
        </label>
        <textarea
          value={dischargeNotes}
          onChange={(e) => setDischargeNotes(e.target.value)}
          placeholder="Add any notes about the discharge (follow-up care, medications, etc.)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
          rows={3}
        />
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-100 border border-red-400 rounded-lg p-3 mb-4">
          <p className="text-red-700 text-sm font-semibold">{errorMessage}</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleDischarge}
          disabled={isLoading}
          className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:bg-red-300 disabled:cursor-not-allowed"
        >
          {isLoading ? "Discharging..." : "Confirm Discharge"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-400 text-white px-4 py-2 rounded-lg hover:bg-gray-500 transition-colors font-semibold"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        ⚠️ This action will mark the patient as discharged, save discharge time,
        and free up their bed.
      </p>
    </div>
  );
}
