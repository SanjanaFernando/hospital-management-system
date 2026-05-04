"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Bed, Patient, Ward } from "@/app/types";
import BedGrid from "@/app/components/BedGrid";
import PatientQueue from "@/app/components/PatientQueue";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import {
  addBedToWard,
  getWardWithPatients,
  getWardsWithPatients,
} from "@/app/actions/wardActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import {
  canAccessWard,
  canAssignOrDischargePatient,
  canManageWardActions,
  canRegisterPatient,
} from "@/lib/rbac";
import {
  CLIENT_CACHE_TTL,
  getClientCache,
  setClientCache,
} from "@/app/utils/clientCache";

export default function WardPage() {
  const params = useParams<{ wardId: string }>();
  const router = useRouter();
  const wardId = params?.wardId;
  const { session } = useAuthSession();

  const [ward, setWard] = useState<Ward | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingBed, setIsAddingBed] = useState(false);
  const [error, setError] = useState("");
  const bedGridRef = useRef<HTMLDivElement | null>(null);
  const [bedGridHeight, setBedGridHeight] = useState<number | undefined>(
    undefined
  );

  const loadWard = useCallback(async () => {
    if (!wardId) return;
    const cacheKey = `ward:${wardId}`;
    const cachedWard = getClientCache<Ward>(cacheKey, CLIENT_CACHE_TTL.ward);

    if (cachedWard) {
      setWard(cachedWard);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    setError("");

    try {
      const wardData = await getWardWithPatients(wardId);
      if (!wardData) {
        throw new Error("Ward not found");
      }
      setWard(wardData);
      setClientCache(cacheKey, wardData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (cachedWard) {
        setError(`Showing cached ward data - ${message}`);
        return;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [wardId]);

  const canCrossWardAssign =
    session.role === "admin" || session.role === "consultant_doctor";

  const loadWards = useCallback(async () => {
    if (!canCrossWardAssign) {
      setWards([]);
      return;
    }

    const cacheKey = "wards:all";
    const cachedWards = getClientCache<Ward[]>(
      cacheKey,
      CLIENT_CACHE_TTL.wards
    );

    if (cachedWards && cachedWards.length > 0) {
      setWards(cachedWards);
    }

    try {
      const wardsData = await getWardsWithPatients();
      if (wardsData && wardsData.length > 0) {
        setWards(wardsData);
        setClientCache(cacheKey, wardsData);
      }
    } catch {
      if (!cachedWards || cachedWards.length === 0) {
        setWards([]);
      }
    }
  }, [canCrossWardAssign]);

  useEffect(() => {
    void loadWard();
    void loadWards();
  }, [loadWard, loadWards]);

  useEffect(() => {
    const updateBedGridHeight = () => {
      const nextHeight = bedGridRef.current?.offsetHeight;
      if (!nextHeight) {
        return;
      }
      setBedGridHeight(nextHeight);
    };

    updateBedGridHeight();
    window.addEventListener("resize", updateBedGridHeight);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && bedGridRef.current) {
      resizeObserver = new ResizeObserver(updateBedGridHeight);
      resizeObserver.observe(bedGridRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateBedGridHeight);
      resizeObserver?.disconnect();
    };
  }, [ward?.beds?.length]);

  const handleBedClick = (bed: Bed) => {
    if (!ward) {
      return;
    }

    if (!canAccessWard(session, ward.wardId || ward.id)) {
      setError("You do not have access to this ward.");
      return;
    }

    router.push(`/wards/${wardId}/${bed.id}`);
  };

  const handleAddBed = async (type: "normal" | "icu") => {
    if (!ward) return;

    setError("");
    setIsAddingBed(true);

    try {
      const result = await addBedToWard(ward.wardId || ward.id, session, type);

      if (!result.success) {
        setError(result.error || "Failed to add bed");
        return;
      }

      await loadWard();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setIsAddingBed(false);
    }
  };

  const resolvedWardId = ward?.wardId || ward?.id || "";

  const specialAssigns = useMemo(() => {
    if (!resolvedWardId || !wards.length) {
      return [] as Array<{
        patient: Patient;
        targetWardId: string;
        targetWardName: string;
        targetBed: Bed;
      }>;
    }

    return wards.flatMap((wardItem) => {
      const targetWardId = wardItem.wardId || wardItem.id;

      if (targetWardId === resolvedWardId) {
        return [];
      }

      return wardItem.beds
        .filter((bed) => bed.patient?.assignedFromWardId === resolvedWardId)
        .filter((bed) => Boolean(bed.patient))
        .map((bed) => ({
          patient: bed.patient as Patient,
          targetWardId,
          targetWardName: wardItem.name,
          targetBed: bed,
        }));
    });
  }, [resolvedWardId, wards]);

  useEffect(() => {
    void loadWards();
  }, [loadWards]);

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

  const wardAccessAllowed = canAccessWard(session, resolvedWardId);
  const canManageWard = canManageWardActions(session, resolvedWardId);
  const canAssignPatients = canAssignOrDischargePatient(
    session,
    resolvedWardId
  );
  const canRegisterInWard = canRegisterPatient(session, resolvedWardId);

  if (!wardAccessAllowed) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Access denied
          </h1>
          <p className="text-gray-600">
            Your role is assigned to a different ward. Switch ward scope from
            the role panel to continue.
          </p>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-white h-fit rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Beds</h2>
              <div className="relative group">
                <button
                  disabled={isAddingBed || !canManageWard}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {!canManageWard
                    ? "Not allowed"
                    : isAddingBed
                      ? "Adding..."
                      : "+ Add Bed"}
                </button>

                {/* Dropdown */}
                <div
                  className="absolute right-0 mt-2 w-40 bg-white border border-gray-400 rounded-xl shadow-lg 
                opacity-0 invisible group-hover:opacity-100 group-hover:visible 
                transition-all duration-200 z-10 overflow-hidden"
                >
                  <button
                    onClick={() => handleAddBed("normal")}
                    className="w-full text-left px-4 py-2 text-sm text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition flex items-center gap-2"
                  >
                    🛏️ Normal Bed
                  </button>

                  <button
                    onClick={() => handleAddBed("icu")}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-50 hover:text-red-600 transition flex items-center gap-2"
                  >
                    ❤️ ICU Bed
                  </button>
                </div>
              </div>
            </div>
            {ward?.beds && ward.beds.length > 0 ? (
              <div ref={bedGridRef}>
                <BedGrid
                  beds={ward.beds}
                  wardName={ward.name || ""}
                  wardId={ward.wardId || ward.id}
                  onAvailableBedClick={handleBedClick}
                  canInteract={wardAccessAllowed}
                />
              </div>
            ) : (
              <p className="text-gray-600">No beds available</p>
            )}

            <div className="mt-6 rounded-2xl border border-cyan-200 bg-linear-to-br from-cyan-50 via-white to-sky-50 p-4 shadow-sm ring-1 ring-cyan-100/60">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-cyan-950">
                    Special Assigns
                  </h3>
                  <p className="text-sm text-cyan-700">
                    Patients transferred here from this ward, shown in a compact
                    grid.
                  </p>
                </div>
                <span className=" bg-cyan-100 px-1 w-full max-w-25 flex justify-center py-1 text-xs font-semibold text-cyan-800">
                  {specialAssigns.length} transfer
                </span>
              </div>

              {specialAssigns.length > 0 ? (
                <div className="grid grid-cols-2">
                  {specialAssigns.map((assign) => (
                    <Link
                      key={assign.patient.id}
                      href={`/wards/${assign.targetWardId}/${assign.targetBed.id}`}
                      className="group rounded-xl border border-cyan-200 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {assign.patient.name}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Now in {assign.targetWardName} -{" "}
                            {assign.targetBed.type === "ICU"
                              ? `ICU Bed ${assign.targetBed.bedNumber}`
                              : `Bed ${assign.targetBed.bedNumber}`}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-cyan-200 bg-white/70 p-4 text-sm text-cyan-800">
                  No transferred patients from this ward.
                </div>
              )}
            </div>
          </div>

          <div
            className="bg-white rounded-lg shadow-md p-6 flex flex-col"
            style={
              bedGridHeight
                ? {
                    height: `${bedGridHeight + 100}px`,
                  }
                : undefined
            }
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Queue</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/wards/${wardId}/register`)}
                  disabled={!canRegisterInWard}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-300 disabled:cursor-not-allowed"
                >
                  {canRegisterInWard
                    ? "+ Register Patient"
                    : "Registration blocked"}
                </button>
                <Link
                  href={`/wards/${ward?.wardId || ward?.id}/patients`}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  View all patients
                </Link>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {ward?.patientQueue && ward.patientQueue.length > 0 ? (
                <PatientQueue
                  patients={ward.patientQueue}
                  beds={ward.beds || []}
                  wards={wards}
                  wardId={ward.wardId || ward.id}
                  wardName={ward.name}
                  onPatientAssigned={loadWard}
                  queueOrderStrategy={ward.queueOrderStrategy}
                  queueOrderMessage={ward.queueOrderMessage}
                  canAssign={canAssignPatients}
                  listMaxHeight={
                    bedGridHeight ? Math.max(0, bedGridHeight - 88) : undefined
                  }
                />
              ) : (
                <p className="text-gray-600">No patients in queue</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
