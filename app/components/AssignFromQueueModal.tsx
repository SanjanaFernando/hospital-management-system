"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bed, Patient, Ward } from "@/app/types";
import {
  assignPatientToBed,
  forceAssignPatientToBed,
  dischargePatientById,
} from "@/app/actions/patientActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import {
  canAssignQueuedPatientAcrossWards,
  canSetTriage,
} from "@/lib/rbac";
import { updatePatient } from "@/app/utils/api";

interface AssignFromQueueModalProps {
  wardId: string;
  wardName: string;
  patient: Patient;
  beds: Bed[];
  wards?: Ward[];
  onAssigned: () => void;
  onTriageUpdated?: () => void;
  onClose: () => void;
}

export default function AssignFromQueueModal({
  wardId,
  wardName,
  patient,
  beds,
  wards,
  onAssigned,
  onTriageUpdated,
  onClose,
}: AssignFromQueueModalProps) {
  const router = useRouter();
  const { session } = useAuthSession();
  const [isMounted, setIsMounted] = useState(false);

  const targetWardOptions = useMemo(
    () =>
      wards && wards.length > 0
        ? wards.map((ward) => ({
            id: ward.id,
            wardId: ward.wardId || ward.id,
            name: ward.name,
            beds: ward.beds,
          }))
        : [
            {
              id: wardId,
              wardId,
              name: wardName,
              beds,
            },
          ],
    [beds, wardId, wardName, wards]
  );

  const [selectedWardId, setSelectedWardId] = useState<string>(
    targetWardOptions.find((ward) => ward.wardId === wardId)?.wardId ||
      wardId ||
      targetWardOptions[0]?.wardId ||
      ""
  );
  const [selectedBedId, setSelectedBedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [isEditingTriage, setIsEditingTriage] = useState(false);
  const [currentPriority, setCurrentPriority] = useState<Patient["priority"]>(
    patient.priority
  );
  const [triageDraft, setTriageDraft] = useState<Patient["priority"]>(
    patient.priority
  );
  const [isUpdatingTriage, setIsUpdatingTriage] = useState(false);
  const [triageError, setTriageError] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setCurrentPriority(patient.priority);
    setTriageDraft(patient.priority);
    setIsEditingTriage(false);
    setTriageError("");
  }, [patient.id, patient.priority]);

  const selectedWard =
    targetWardOptions.find((ward) => ward.wardId === selectedWardId) ||
    targetWardOptions[0];

  useEffect(() => {
    const selectedWardExists = targetWardOptions.some(
      (ward) => ward.wardId === selectedWardId
    );

    if (selectedWardExists) {
      return;
    }

    const currentWardOption = targetWardOptions.find(
      (ward) => ward.wardId === wardId
    );

    if (currentWardOption) {
      setSelectedWardId(currentWardOption.wardId);
      setSelectedBedId("");
      return;
    }

    if (targetWardOptions[0]) {
      setSelectedWardId(targetWardOptions[0].wardId);
      setSelectedBedId("");
    }
  }, [wardId, selectedWardId, targetWardOptions]);

  const selectedBeds = selectedWard?.beds || beds;
  const availableBeds = selectedBeds.filter((b) => b.status === "available");
  const occupiedBeds = selectedBeds.filter((b) => b.status === "occupied");
  const canCrossWardAssign = Boolean(
    wards && wards.length > 1 && session.role !== "main_attendant"
  );

  const canEditTriage = Boolean(wardId) && canSetTriage(session, wardId);

  const selectedWardResolvedId = selectedWard?.wardId || wardId;
  const canAssignToSelectedWard = canCrossWardAssign
    ? canAssignQueuedPatientAcrossWards(
        session,
        wardId,
        selectedWardResolvedId
      )
    : Boolean(selectedWardResolvedId && selectedWardResolvedId === wardId);

  const handleSaveTriage = async () => {
    const targetPatientId = patient._id || patient.id;
    setTriageError("");
    setIsUpdatingTriage(true);
    try {
      await updatePatient(
        targetPatientId,
        { priority: triageDraft, triageRequested: false },
        session
      );
      setCurrentPriority(triageDraft);
      setIsEditingTriage(false);
      (onTriageUpdated || onAssigned)();
    } catch (err) {
      setTriageError(
        err instanceof Error ? err.message : "Failed to update triage"
      );
    } finally {
      setIsUpdatingTriage(false);
    }
  };

  const handleAssign = async (force = false) => {
    if (!selectedBedId) return setErrorMessage("Please select a bed");
    setErrorMessage("");
    setIsLoading(true);
    try {
      const targetWardId = selectedWardResolvedId;
      if (force) {
        await forceAssignPatientToBed({
          wardId: targetWardId,
          sourceWardId: wardId,
          bedId: selectedBedId,
          patientId: patient.id,
          actor: session,
        });
      } else {
        await assignPatientToBed({
          wardId: targetWardId,
          sourceWardId: wardId,
          bedId: selectedBedId,
          patientId: patient.id,
          actor: session,
        });
      }
      onAssigned();
      onClose();
      router.push(`/wards/${targetWardId}`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to assign patient"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDischarge = async () => {
    setErrorMessage("");
    setIsLoading(true);
    try {
      await dischargePatientById(patient.id, session);
      onAssigned();
      onClose();
      router.push(`/wards/${wardId}`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to discharge patient"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const selectedBed = selectedBeds.find((b) => b.id === selectedBedId);

  if (!isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-black">
            Assign Patient to Bed
          </h3>
          <button onClick={onClose} className="text-xl text-black">
            ✕
          </button>
        </div>

        <div className="border rounded p-4 mb-6 bg-sky-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-black">Patient to assign</p>
              <p className="font-semibold text-lg text-black flex items-center gap-1.5 flex-wrap">
                {patient.name}
                {patient.priorityScore !== undefined && (
                  <span
                    className="text-xs font-bold text-white bg-indigo-500 px-1.5 py-0.5 rounded-full ring-1 ring-indigo-600/30"
                    title="AI priority score"
                  >
                    {patient.priorityScore.toFixed(3)}
                  </span>
                )}
              </p>
              <div className="flex gap-2 mt-2">
                <span className="px-2 py-1 rounded bg-gray-200 text-xs text-black">
                  {patient.age}y - {patient.ageGroup}
                </span>
                <span className="px-2 py-1 rounded bg-gray-200 text-xs text-black">
                  {patient.disease}
                </span>
              </div>
            </div>
            <div>
              {!isEditingTriage ? (
                <button
                  onClick={() => canEditTriage && setIsEditingTriage(true)}
                  className={`px-3 py-1 rounded text-sm bg-orange-200 text-black ${canEditTriage ? "cursor-pointer" : ""}`}
                >
                  {currentPriority}
                </button>
              ) : (
                <div className="flex text-black items-center gap-2">
                  <select
                    value={triageDraft}
                    onChange={(e) =>
                      setTriageDraft(e.target.value as Patient["priority"])
                    }
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="Triage 1">Triage 1</option>
                    <option value="Triage 2">Triage 2</option>
                    <option value="Triage 3">Triage 3</option>
                    <option value="Triage 4">Triage 4</option>
                    <option value="Triage 5">Triage 5</option>
                  </select>
                  <button
                    onClick={handleSaveTriage}
                    disabled={
                      isUpdatingTriage || triageDraft === currentPriority
                    }
                    className="bg-green-600 text-white px-3 py-1 rounded"
                  >
                    {isUpdatingTriage ? "..." : "✓"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingTriage(false);
                      setTriageDraft(currentPriority);
                      setTriageError("");
                    }}
                    className="bg-gray-300 px-3 py-1 rounded"
                  >
                    ✕
                  </button>
                </div>
              )}
              {triageError && (
                <p className="text-xs text-red-600 mt-2">{triageError}</p>
              )}
            </div>
          </div>
          {patient.specialRequirements &&
            patient.specialRequirements.length > 0 && (
              <p className="text-xs mt-3 text-black">
                <strong>Special needs:</strong>{" "}
                {patient.specialRequirements.join(", ")}
              </p>
            )}
        </div>

        {canCrossWardAssign && targetWardOptions.length > 1 && (
          <div className="mb-6 rounded border bg-slate-50 p-4">
            <label className="block text-sm font-semibold text-black mb-2">
              Target Ward
            </label>
            <select
              value={selectedWardId}
              onChange={(e) => {
                setSelectedWardId(e.target.value);
                setSelectedBedId("");
              }}
              className="w-full rounded border px-3 py-2 text-sm text-black"
            >
              {targetWardOptions.map((wardOption) => (
                <option key={wardOption.wardId} value={wardOption.wardId}>
                  {wardOption.name}
                </option>
              ))}
            </select>
            {!canAssignToSelectedWard && (
              <p className="mt-2 text-xs text-amber-700">
                You can only transfer queued patients from your own ward.
              </p>
            )}
          </div>
        )}

        {availableBeds.length > 0 && (
          <div className="mb-6">
            <h4 className="font-semibold mb-2 text-black">
              Available Beds in {selectedWard?.name || wardName} ({availableBeds.length})
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {availableBeds.map((bed) => (
                <button
                  key={bed.id}
                  onClick={() => setSelectedBedId(bed.id)}
                  className={`p-3 border rounded ${selectedBedId === bed.id ? "border-green-600 bg-green-50" : "border-gray-200"}`}
                >
                  <div className="font-semibold text-black">
                    {bed.type === "ICU"
                      ? `ICU Bed ${bed.bedNumber}`
                      : `Bed ${bed.bedNumber}`}
                  </div>
                  <div className="text-xs text-green-600">Available</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {occupiedBeds.length > 0 && (
          <div className="mb-6">
            <h4 className="font-semibold mb-2 text-black">
              Occupied Beds in {selectedWard?.name || wardName} ({occupiedBeds.length}) - Force Assign
            </h4>
            <p className="text-xs text-black mb-2">
              ⚠️ Force assigning will move the current patient back to the queue
            </p>
            <div className="grid grid-cols-2 gap-2">
              {occupiedBeds.map((bed) => (
                <button
                  key={bed.id}
                  onClick={() => setSelectedBedId(bed.id)}
                  className={`p-3 border rounded text-left ${selectedBedId === bed.id ? "border-orange-600 bg-orange-50" : "border-gray-200"}`}
                >
                  <div className="font-semibold text-black">
                    {bed.type === "ICU"
                      ? `ICU Bed ${bed.bedNumber}`
                      : `Bed ${bed.bedNumber}`}
                  </div>
                  <div className="text-xs text-red-600">Occupied</div>
                  {bed.patient && (
                    <div className="text-xs text-black mt-1 truncate">
                      Current: {bed.patient.name}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {availableBeds.length === 0 && occupiedBeds.length === 0 && (
          <div className="bg-yellow-50 border rounded p-4 mb-6">
            No beds available in {selectedWard?.name || wardName}.
          </div>
        )}

        {errorMessage && (
          <div className="text-sm text-red-700 mb-4">{errorMessage}</div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleAssign(false)}
            disabled={isLoading || !selectedBedId}
            className="flex-1 bg-green-600 text-white py-2 rounded"
          >
            {isLoading
              ? "Assigning..."
              : selectedBed
                ? `Assign to ${selectedBed.bedNumber}`
                : "Select a bed"}
          </button>
          <button
            onClick={() => handleAssign(true)}
            disabled={isLoading || !selectedBedId}
            className="flex-1 bg-orange-600 text-white py-2 rounded"
          >
            {isLoading ? "Force..." : "Force Assign"}
          </button>
        </div>

        <button
          onClick={handleDischarge}
          disabled={isLoading}
          className="mt-3 w-full bg-red-600 text-white py-2 rounded"
        >
          {isLoading ? "Discharging..." : "Discharge Patient"}
        </button>
      </div>
    </div>,
    document.body
  );
}
