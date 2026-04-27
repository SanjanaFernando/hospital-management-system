"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, Plus, Wrench } from "lucide-react";
import { Bed, Ward } from "@/app/types";
import PatientDetail from "@/app/components/PatientDetail";
import AssignPatientModal from "@/app/components/AssignPatientModal";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import {
  getWardWithPatients,
  updateBedStatus,
} from "@/app/actions/wardActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import {
  canAccessWard,
  canAssignOrDischargePatient,
  canUpdateBedStatus,
} from "@/lib/rbac";

export default function BedDetailPage() {
  const params = useParams<{ wardId: string; bedId: string }>();
  const wardId = params?.wardId;
  const bedId = params?.bedId;
  const { session } = useAuthSession();

  const [ward, setWard] = useState<Ward | null>(null);
  const [bed, setBed] = useState<Bed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);

  const loadWard = useCallback(async () => {
    if (!wardId) return;
    setIsLoading(true);
    setError("");

    try {
      const wardData = await getWardWithPatients(wardId);
      if (!wardData) {
        throw new Error("Ward not found");
      }
      setWard(wardData);

      // Find the specific bed
      const foundBed = wardData.beds?.find((b) => b.id === bedId);
      if (!foundBed) {
        throw new Error("Bed not found");
      }
      setBed(foundBed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [wardId, bedId]);

  useEffect(() => {
    void loadWard();
  }, [loadWard]);

  const handleDischargeSuccess = () => {
    loadWard();
  };

  const handleMoveToQueueSuccess = () => {
    loadWard();
  };

  const handleChangeBedStatus = async (
    newStatus: "available" | "maintenance"
  ) => {
    try {
      setError("");
      const result = await updateBedStatus(bed?.id || "", newStatus, session);

      if (result.success) {
        await loadWard();
      } else {
        setError(result.error || "Failed to update bed status");
      }
    } catch (err) {
      console.error("Error updating bed status:", err);
      setError("An unexpected error occurred while updating bed status");
    }
  };

  const handleAssignPatient = () => {
    setShowAssignModal(true);
  };

  const handleAssignedSuccess = () => {
    setShowAssignModal(false);
    loadWard();
  };

  if (isLoading) {
    return <MedicalCrossLoader message="Loading Bed Details..." fullScreen />;
  }

  if (!ward || !bed) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/wards/${wardId}`}
            className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={20} />
            Back to Ward
          </Link>
          <div className="bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              {error || "Bed not found"}
            </h1>
            <p className="text-gray-600">
              The bed you requested does not exist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const resolvedWardId = ward.wardId || ward.id;
  const wardAccessAllowed = canAccessWard(session, resolvedWardId);
  const canManagePatients = canAssignOrDischargePatient(
    session,
    resolvedWardId
  );
  const canUpdateBed = canUpdateBedStatus(session, resolvedWardId);

  if (!wardAccessAllowed) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Access denied
          </h1>
          <p className="text-gray-600">
            Your role is scoped to a different ward.
          </p>
        </div>
      </div>
    );
  }

  const statusColors = {
    available: "bg-green-100 border-green-500 text-green-800",
    occupied: "bg-blue-100 border-blue-500 text-blue-800",
    maintenance: "bg-yellow-100 border-yellow-500 text-yellow-800",
  };

  const statusLabels = {
    available: "Available",
    occupied: "Occupied",
    maintenance: "Maintenance",
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href={`/wards/${wardId}`}
          className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft size={20} />
          Back to Ward
        </Link>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-gray-500 mb-2">{ward.name}</p>
              <h1 className="text-3xl font-bold text-gray-800">
                Bed {bed.bedNumber}
              </h1>
            </div>
            <div
              className={`px-6 py-3 rounded-lg border-2 font-bold text-lg ${statusColors[bed.status]}`}
            >
              {statusLabels[bed.status]}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <div className="border-t pt-6">
            {bed.patient ? (
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-6">
                  Patient Information
                </h2>
                <PatientDetail
                  patient={bed.patient}
                  onDischargeSuccess={handleDischargeSuccess}
                  onMoveToQueueSuccess={handleMoveToQueueSuccess}
                  canManageActions={canManagePatients}
                />
              </div>
            ) : bed.status === "available" ? (
              <div className="text-center py-12">
                <div className="inline-block bg-green-100 rounded-full p-4 mb-4">
                  <svg
                    className="w-12 h-12 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-lg text-gray-600">This bed is available</p>
                <p className="text-sm text-gray-500 mt-2">
                  Ready to accept new patients
                </p>
              </div>
            ) : bed.status === "maintenance" ? (
              <div className="text-center py-12">
                <div className="inline-block bg-yellow-100 rounded-full p-4 mb-4">
                  <svg
                    className="w-12 h-12 text-yellow-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-lg text-gray-600">
                  This bed is under maintenance
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Not available for patient admission
                </p>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-lg text-gray-600">No patient assigned</p>
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-4">
            <Link
              href={`/wards/${wardId}`}
              className="flex-1 text-center inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft size={20} />
              Back to Ward
            </Link>

            {bed.status === "available" && (
              <>
                {canManagePatients && (
                  <button
                    onClick={handleAssignPatient}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <Plus size={20} />
                    Assign Patient
                  </button>
                )}
                {canUpdateBed && (
                  <button
                    onClick={() => handleChangeBedStatus("maintenance")}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
                  >
                    <Wrench size={20} />
                    Mark Maintenance
                  </button>
                )}
              </>
            )}

            {bed.status === "maintenance" && canUpdateBed && (
              <button
                onClick={() => handleChangeBedStatus("available")}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Mark Available
              </button>
            )}
          </div>
        </div>
      </div>

      {showAssignModal && bed && ward && canManagePatients && (
        <AssignPatientModal
          wardId={ward.wardId || ward.id}
          bed={bed}
          queue={ward.patientQueue}
          onAssigned={handleAssignedSuccess}
          onCancel={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}
