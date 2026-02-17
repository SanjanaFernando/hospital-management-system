"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Ward } from "@/app/types";
import PatientRegistrationForm from "@/app/components/PatientRegistrationForm";
import PatientList from "@/app/components/PatientList";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import { getWardWithPatients } from "@/app/actions/wardActions";

export default function WardPatientsPage() {
  const params = useParams<{ wardId: string }>();
  const wardId = params?.wardId;

  const [ward, setWard] = useState<Ward | null>(null);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWard = async () => {
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
  };

  useEffect(() => {
    loadWard();
  }, [wardId]);

  const handlePatientRegistered = () => {
    setShowRegistrationForm(false);
    loadWard();
  };

  if (isLoading) {
    return <MedicalCrossLoader message="Loading Patients..." fullScreen />;
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
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/wards/${ward.wardId || ward.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={20} />
            Back to Ward
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">
            {ward.name} - Patients
          </h1>
        </div>

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-800">
            Manage Patients
          </h2>
          <button
            onClick={() => setShowRegistrationForm((prev) => !prev)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
          >
            {showRegistrationForm ? "Close Form" : "+ Register Patient"}
          </button>
        </div>

        {showRegistrationForm && (
          <div className="mb-8">
            <PatientRegistrationForm
              wardId={ward.wardId || ward.id}
              onSuccess={handlePatientRegistered}
              onCancel={() => setShowRegistrationForm(false)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PatientList title="Admitted Patients" patients={ward.patients} />
          <PatientList title="Queued Patients" patients={ward.patientQueue} />
        </div>
      </div>
    </div>
  );
}
