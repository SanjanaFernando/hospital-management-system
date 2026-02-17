"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bed, Patient } from "@/app/types";
import { assignPatientToBed } from "@/app/actions/patientActions";
import { forceAssignPatientToBed } from "@/app/actions/patientActions";
import { dischargePatientById } from "@/app/actions/patientActions";

interface AssignFromQueueModalProps {
  wardId: string;
  wardName: string;
  patient: Patient;
  beds: Bed[];
  onAssigned: () => void;
  onClose: () => void;
}

export default function AssignFromQueueModal({
  wardId,
  wardName,
  patient,
  beds,
  onAssigned,
  onClose,
}: AssignFromQueueModalProps) {
  const router = useRouter();
  const [selectedBedId, setSelectedBedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const availableBeds = beds.filter((bed) => bed.status === "available");
  const occupiedBeds = beds.filter((bed) => bed.status === "occupied");

  const handleAssign = async (forceAssign: boolean = false) => {
    if (!selectedBedId) {
      setErrorMessage("Please select a bed");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      if (forceAssign) {
        await forceAssignPatientToBed({
          wardId,
          bedId: selectedBedId,
          patientId: patient.id,
        });
      } else {
        await assignPatientToBed({
          wardId,
          bedId: selectedBedId,
          patientId: patient.id,
        });
      }
      onAssigned();
      // Close modal and navigate back after successful assignment
      setTimeout(() => {
        onClose();
        router.push(`/wards/${wardId}`);
      }, 300);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to assign patient";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedBed = beds.find((bed) => bed.id === selectedBedId);

  const handleCloseClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  const handleDischarge = async () => {
    setErrorMessage("");
    setIsLoading(true);

    try {
      await dischargePatientById(patient.id);
      onAssigned(); // Trigger parent refresh
      // Close modal and navigate back after successful discharge
      setTimeout(() => {
        onClose();
        router.push(`/wards/${wardId}`);
      }, 300);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to discharge patient";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">
            Assign Patient to Bed
          </h3>
          <button
            onClick={handleCloseClick}
            className="text-gray-400 cursor-pointer hover:text-gray-600 text-2xl"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Patient Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600 mb-1">Patient to assign:</p>
          <p className="font-bold text-lg text-gray-800">{patient.name}</p>
          <div className="flex gap-2 mt-2">
            <span className="px-2 py-1 rounded text-xs text-gray-600 font-medium bg-gray-200">
              {patient.age}y - {patient.ageGroup}
            </span>
            <span className="px-2 py-1 rounded text-xs font-medium bg-orange-200 text-orange-800">
              {patient.priority}
            </span>
            <span className="px-2 py-1 rounded text-gray-600 text-xs font-medium bg-gray-200">
              {patient.disease}
            </span>
          </div>
          {patient.specialRequirements &&
            patient.specialRequirements.length > 0 && (
              <p className="text-xs mt-2 text-gray-600">
                <span className="font-semibold">Special needs:</span>{" "}
                {patient.specialRequirements.join(", ")}
              </p>
            )}
        </div>

        {/* Available Beds Section */}
        {availableBeds.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              Available Beds ({availableBeds.length})
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {availableBeds.map((bed) => (
                <button
                  key={bed.id}
                  onClick={() => setSelectedBedId(bed.id)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedBedId === bed.id
                      ? "border-green-600 bg-green-50"
                      : "border-gray-300 bg-white hover:border-green-400"
                  }`}
                >
                  <p className="font-semibold text-gray-800">
                    Bed {bed.bedNumber}
                  </p>
                  <p className="text-xs text-green-600 font-medium">
                    Available
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Occupied Beds Section */}
        {occupiedBeds.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              Occupied Beds ({occupiedBeds.length}) - Force Assign
            </h4>
            <p className="text-xs text-gray-600 mb-3">
              ⚠️ Force assigning will move the current patient back to the queue
            </p>
            <div className="grid grid-cols-2 gap-2">
              {occupiedBeds.map((bed) => (
                <button
                  key={bed.id}
                  onClick={() => setSelectedBedId(bed.id)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    selectedBedId === bed.id
                      ? "border-orange-600 bg-orange-50"
                      : "border-gray-300 bg-white hover:border-orange-400"
                  }`}
                >
                  <p className="font-semibold text-gray-800">
                    Bed {bed.bedNumber}
                  </p>
                  <p className="text-xs text-red-600 font-medium">Occupied</p>
                  {bed.patient && (
                    <p className="text-xs text-gray-600 mt-1 truncate">
                      Current: {bed.patient.name}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {availableBeds.length === 0 && occupiedBeds.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              No beds available in {wardName}. All beds may be under
              maintenance.
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 mb-4">
            <p className="text-sm font-semibold text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <div className="flex gap-3">
            {selectedBed && selectedBed.status === "available" ? (
              <button
                onClick={() => handleAssign(false)}
                disabled={isLoading || !selectedBedId}
                className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-white font-semibold hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
              >
                {isLoading
                  ? "Assigning..."
                  : `Assign to Bed ${selectedBed.bedNumber}`}
              </button>
            ) : selectedBed && selectedBed.status === "occupied" ? (
              <button
                onClick={() => handleAssign(true)}
                disabled={isLoading || !selectedBedId}
                className="flex-1 rounded-lg bg-orange-600 px-4 py-3 text-white font-semibold hover:bg-orange-700 disabled:bg-orange-300 disabled:cursor-not-allowed"
              >
                {isLoading
                  ? "Force Assigning..."
                  : `Force Assign to Bed ${selectedBed.bedNumber}`}
              </button>
            ) : (
              <button
                disabled
                className="flex-1 rounded-lg bg-gray-300 px-4 py-3 text-gray-500 font-semibold cursor-not-allowed"
              >
                Select a bed first
              </button>
            )}
            <button
              onClick={handleCloseClick}
              disabled={isLoading}
              className="flex-1 rounded-lg bg-gray-300 px-4 py-3 text-gray-800 font-semibold hover:bg-gray-400 disabled:bg-gray-200 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
          <button
            onClick={handleDischarge}
            disabled={isLoading}
            className="w-full rounded-lg bg-red-600 px-4 py-3 text-white font-semibold hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
          >
            {isLoading ? "Discharging..." : "Discharge Patient"}
          </button>
        </div>
      </div>
    </div>
  );
}
