"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Ward } from "@/app/types";
import PatientQueue from "@/app/components/PatientQueue";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import { getWardWithPatients } from "@/app/actions/wardActions";

export default function WardQueuePage() {
  const params = useParams<{ wardId: string }>();
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

  if (isLoading) {
    return <MedicalCrossLoader message="Loading Queue..." fullScreen />;
  }

  if (!ward) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={20} />
            Back to Wards
          </Link>
          <div className="bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold text-gray-800">Ward not found</h1>
            {error && <p className="text-gray-600 mt-2">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/wards/${ward.wardId || ward.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={20} />
            Back to Ward
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">
            {ward.name} - Queue
          </h1>
        </div>

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-8">
          <PatientQueue patients={ward?.patientQueue || []} />
        </div>
      </div>
    </div>
  );
}
