"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Bed, Ward } from "@/app/types";
import BedGrid from "@/app/components/BedGrid";
import PatientQueue from "@/app/components/PatientQueue";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import { getWardWithPatients } from "@/app/actions/wardActions";

export default function WardPage() {
  const params = useParams<{ wardId: string }>();
  const router = useRouter();
  const wardId = params?.wardId;

  const [ward, setWard] = useState<Ward | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [wardId]);

  useEffect(() => {
    void loadWard();
  }, [loadWard]);

  const handleBedClick = (bed: Bed) => {
    router.push(`/wards/${wardId}/${bed.id}`);
  };

  const handleDischarged = () => {
    loadWard();
  };

  if (isLoading) {
    return <MedicalCrossLoader message="Loading Ward..." fullScreen />;
  }

  if (!ward) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={20} />
            Back to Wards
          </Link>
          <div className="bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Ward not found
            </h1>
            <p className="text-gray-600">
              The ward you requested does not exist.
            </p>
            {error && <p className="text-red-600 mt-2">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={20} />
            Back to Dashboard
          </Link>
          <div className="text-right">
            <p className="text-sm text-gray-500">Ward</p>
            <h1 className="text-3xl font-bold text-gray-800">
              {ward?.name || "Unknown Ward"}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-500">
            <p className="text-sm text-gray-600">Available</p>
            <p className="text-2xl font-bold text-green-600">
              {ward?.availableBeds || 0}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
            <p className="text-sm text-gray-600">Occupied</p>
            <p className="text-2xl font-bold text-blue-600">
              {ward?.occupiedBeds || 0}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-600">Maintenance</p>
            <p className="text-2xl font-bold text-yellow-600">
              {ward?.maintenanceBeds || 0}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-500">
            <p className="text-sm text-gray-600">Queue</p>
            <p className="text-2xl font-bold text-purple-600">
              {ward?.patientQueue?.length || 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Beds</h2>
            {ward?.beds && ward.beds.length > 0 ? (
              <BedGrid
                beds={ward.beds}
                wardName={ward.name || ""}
                onAvailableBedClick={handleBedClick}
                onDischargeSuccess={handleDischarged}
              />
            ) : (
              <p className="text-gray-600">No beds available</p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Queue</h2>
              <Link
                href={`/wards/${ward?.wardId || ward?.id}/patients`}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                View all patients
              </Link>
            </div>
            {ward?.patientQueue && ward.patientQueue.length > 0 ? (
              <PatientQueue
                patients={ward.patientQueue}
                onPatientAssigned={handleDischarged}
              />
            ) : (
              <p className="text-gray-600">No patients in queue</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
