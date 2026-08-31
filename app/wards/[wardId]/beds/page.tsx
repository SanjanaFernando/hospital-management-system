"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Bed, BedGender, Ward } from "@/app/types";
import BedGrid from "@/app/components/BedGrid";
import AssignPatientModal from "@/app/components/AssignPatientModal";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import { addBedToWard, getWardWithPatients } from "@/app/actions/wardActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import {
  canAccessWard,
  canAssignOrDischargePatient,
  canManageWardActions,
} from "@/lib/rbac";

type BedType = "normal" | "icu";

export default function WardBedsPage() {
  const params = useParams<{ wardId: string }>();
  const wardId = params?.wardId;
  const { session } = useAuthSession();

  const [ward, setWard] = useState<Ward | null>(null);
  const [assignBed, setAssignBed] = useState<Bed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingBed, setIsAddingBed] = useState(false);
  const [error, setError] = useState("");

  // Add Bed form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBedType, setNewBedType] = useState<BedType>("normal");
  const [newBedGender, setNewBedGender] = useState<BedGender>("Unisex");

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

  const handleAssignPatient = (bed: Bed) => {
    if (!ward) {
      return;
    }

    if (!canAssignOrDischargePatient(session, ward.wardId || ward.id)) {
      setError("Your role cannot assign patients in this ward.");
      return;
    }

    setAssignBed(bed);
  };

  const handleAssigned = () => {
    setAssignBed(null);
    loadWard();
  };

  const handleAddBed = async () => {
    if (!ward) return;

    setError("");
    setIsAddingBed(true);

    try {
      const result = await addBedToWard(
        ward.wardId || ward.id,
        session,
        newBedType,
        newBedGender
      );
      if (!result.success) {
        setError(result.error || "Failed to add bed");
        return;
      }

      setShowAddForm(false);
      await loadWard();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setIsAddingBed(false);
    }
  };

  if (isLoading) {
    return <MedicalCrossLoader message="Loading Beds..." fullScreen />;
  }

  if (!ward) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </div>
          <div className="bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold text-gray-800">Ward not found</h1>
            {error && <p className="text-gray-600 mt-2">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  const resolvedWardId = ward.wardId || ward.id;
  const wardAccessAllowed = canAccessWard(session, resolvedWardId);
  const canManageWard = canManageWardActions(session, resolvedWardId);
  const canAssignPatients = canAssignOrDischargePatient(
    session,
    resolvedWardId
  );

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

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href={`/wards/${ward.wardId || ward.id}`}
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{ward.name}</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Bed Management
              </h1>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex justify-end mb-4">
            {canManageWard && !showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Add Bed
              </button>
            )}
            {!canManageWard && (
              <span className="px-4 py-2 bg-blue-300 text-white text-sm rounded-lg cursor-not-allowed">
                Not allowed
              </span>
            )}
          </div>

          {/* Add Bed Form */}
          {showAddForm && canManageWard && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
              <h3 className="text-sm font-bold text-blue-900 mb-4">
                New Bed Configuration
              </h3>
              <div className="flex flex-wrap gap-6 items-end">
                {/* Bed Type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Bed Type
                  </label>
                  <div className="flex gap-2">
                    {(["normal", "icu"] as BedType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setNewBedType(t)}
                        className={`px-3 py-1.5 text-sm rounded-lg font-semibold border transition-all ${
                          newBedType === t
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-gray-300 text-gray-700 hover:border-blue-400"
                        }`}
                      >
                        {t === "icu" ? "ICU" : "Normal"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gender designation */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Gender Designation
                  </label>
                  <div className="flex gap-2">
                    {(["Male", "Female", "Unisex"] as BedGender[]).map((g) => (
                      <button
                        key={g}
                        onClick={() => setNewBedGender(g)}
                        className={`px-3 py-1.5 text-sm rounded-lg font-semibold border transition-all ${
                          newBedGender === g
                            ? g === "Male"
                              ? "bg-blue-600 border-blue-600 text-white"
                              : g === "Female"
                              ? "bg-pink-500 border-pink-500 text-white"
                              : "bg-slate-600 border-slate-600 text-white"
                            : "bg-white border-gray-300 text-gray-700 hover:border-blue-400"
                        }`}
                      >
                        {g === "Male" ? "♂ Male" : g === "Female" ? "♀ Female" : "⚪ Unisex"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={handleAddBed}
                    disabled={isAddingBed}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-300"
                  >
                    {isAddingBed ? "Adding..." : "Confirm Add"}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setNewBedType("normal");
                      setNewBedGender("Unisex");
                    }}
                    disabled={isAddingBed}
                    className="px-4 py-2 bg-gray-300 text-gray-800 text-sm rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <p className="mt-3 text-xs text-blue-700">
                {newBedGender !== "Unisex"
                  ? `⚠ This bed will only accept ${newBedGender} patients by default. Force-assign can override.`
                  : "Unisex beds accept patients of any gender."}
              </p>
            </div>
          )}

          <BedGrid
            beds={ward.beds}
            wardName={ward.name}
            wardId={ward.wardId || ward.id}
            onAvailableBedClick={handleAssignPatient}
            canInteract={canAssignPatients}
          />
        </div>

        {assignBed && (
          <AssignPatientModal
            wardId={ward.wardId || ward.id}
            bed={assignBed}
            queue={ward.patientQueue}
            onAssigned={handleAssigned}
            onCancel={() => setAssignBed(null)}
          />
        )}
      </div>
    </div>
  );
}
