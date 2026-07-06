"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Bed, Patient, Ward } from "@/app/types";
import BedGrid from "@/app/components/BedGrid";
import PatientQueue from "@/app/components/PatientQueue";
import { addBedToWard, getWardWithPatients } from "@/app/actions/wardActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import {
  canAccessWard,
  canAssignOrDischargePatient,
  canManageWardActions,
  canRegisterPatient,
} from "@/lib/rbac";

interface WardOverviewClientProps {
  initialWard: Ward;
  initialWards: Ward[];
}

export default function WardOverviewClient({
  initialWard,
  initialWards,
}: WardOverviewClientProps) {
  const router = useRouter();
  const { session } = useAuthSession();

  const [ward, setWard] = useState<Ward>(initialWard);
  const [wards, setWards] = useState<Ward[]>(initialWards);
  const [isAddingBed, setIsAddingBed] = useState(false);
  const [error, setError] = useState("");

  const bedGridRef = useRef<HTMLDivElement>(null);
  const [bedGridHeight, setBedGridHeight] = useState<number | undefined>();

  // Only sync heights on large screens
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => setWard(initialWard), [initialWard]);
  useEffect(() => setWards(initialWards), [initialWards]);

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024); // lg breakpoint
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Update bed grid height (only on large screens)
  useEffect(() => {
    const updateBedGridHeight = () => {
      if (!bedGridRef.current || !isLargeScreen) {
        setBedGridHeight(undefined);
        return;
      }
      const height = bedGridRef.current.offsetHeight;
      if (height > 100) {
        setBedGridHeight(height);
      }
    };

    updateBedGridHeight();

    const resizeObserver = new ResizeObserver(updateBedGridHeight);
    if (bedGridRef.current) {
      resizeObserver.observe(bedGridRef.current);
    }

    window.addEventListener("resize", updateBedGridHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateBedGridHeight);
    };
  }, [ward.beds.length, isLargeScreen]);

  const resolvedWardId = ward.wardId || ward.id;
  const wardAccessAllowed = canAccessWard(session, resolvedWardId);
  const canManageWard = canManageWardActions(session, resolvedWardId);
  const canAssignPatients = canAssignOrDischargePatient(
    session,
    resolvedWardId
  );
  const canRegisterInWard = canRegisterPatient(session, resolvedWardId);

  const canCrossWardAssign =
    session.role === "admin" || session.role === "consultant_doctor";

  const specialAssigns = useMemo(() => {
    if (!resolvedWardId || !wards.length) return [];

    return wards.flatMap((wardItem) => {
      const targetWardId = wardItem.wardId || wardItem.id;
      if (targetWardId === resolvedWardId) return [];

      return wardItem.beds
        .filter(
          (bed) =>
            bed.patient?.assignedFromWardId === resolvedWardId && bed.patient
        )
        .map((bed) => ({
          patient: bed.patient as Patient,
          targetWardId,
          targetWardName: wardItem.name,
          targetBed: bed,
        }));
    });
  }, [resolvedWardId, wards]);

  const handleBedClick = (bed: Bed) => {
    if (!wardAccessAllowed) {
      setError("You do not have access to this ward.");
      return;
    }
    router.push(`/wards/${resolvedWardId}/${bed.id}`);
  };

  const refreshWard = useCallback(async () => {
    const wardData = await getWardWithPatients(resolvedWardId);
    if (wardData) setWard(wardData);
  }, [resolvedWardId]);

  const handleAddBed = async (type: "normal" | "icu") => {
    setError("");
    setIsAddingBed(true);
    try {
      const result = await addBedToWard(resolvedWardId, session, type);
      if (!result.success) {
        setError(result.error || "Failed to add bed");
        return;
      }
      await refreshWard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsAddingBed(false);
    }
  };

  if (!ward) {
    return <div className="p-8 text-center">Ward not found</div>;
  }

  if (!wardAccessAllowed) {
    return <div className="p-8 text-center">Access denied</div>;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-slate-50 to-indigo-100 p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-700"
          >
            <ChevronLeft size={20} />
          </Link>
          <div className="text-right">
            <p className="text-sm text-gray-500">Ward</p>
            <h1 className="text-3xl font-bold text-gray-800">{ward.name}</h1>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg border-l-4 border-green-500 bg-white p-4 shadow-md">
            <p className="text-sm text-gray-600">Available</p>
            <p className="text-2xl font-bold text-green-600">
              {ward.availableBeds}
            </p>
          </div>
          <div className="rounded-lg border-l-4 border-blue-500 bg-white p-4 shadow-md">
            <p className="text-sm text-gray-600">Occupied</p>
            <p className="text-2xl font-bold text-blue-600">
              {ward.occupiedBeds}
            </p>
          </div>
          <div className="rounded-lg border-l-4 border-yellow-500 bg-white p-4 shadow-md">
            <p className="text-sm text-gray-600">Maintenance</p>
            <p className="text-2xl font-bold text-yellow-600">
              {ward.maintenanceBeds}
            </p>
          </div>
          <div className="rounded-lg border-l-4 border-purple-500 bg-white p-4 shadow-md">
            <p className="text-sm text-gray-600">Queue</p>
            <p className="text-2xl font-bold text-purple-600">
              {ward.patientQueue.length}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Beds Column */}
          <div className="rounded-lg border border-white/60 bg-white/95 p-6 shadow-md backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">Beds</h2>
              <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-2">
                <button
                  onClick={() => handleAddBed("normal")}
                  disabled={isAddingBed || !canManageWard}
                  className="rounded-lg bg-slate-700 px-3 py-1 text-sm text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isAddingBed ? "Adding..." : "+ Normal Bed"}
                </button>
                <button
                  onClick={() => handleAddBed("icu")}
                  disabled={isAddingBed || !canManageWard}
                  className="rounded-lg bg-rose-600 px-3 py-1 text-sm text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
                >
                  {isAddingBed ? "Adding..." : "+ ICU Bed"}
                </button>
              </div>
            </div>

            {ward.beds.length > 0 ? (
              <div ref={bedGridRef}>
                <BedGrid
                  beds={ward.beds}
                  wardName={ward.name}
                  wardId={resolvedWardId}
                  onAvailableBedClick={handleBedClick}
                  canInteract={wardAccessAllowed}
                />
              </div>
            ) : (
              <p className="text-gray-600">No beds available</p>
            )}

            {/* Special Assigns */}
            {canCrossWardAssign && specialAssigns.length > 0 && (
              <div className="mt-6 rounded-2xl border border-cyan-200 bg-linear-to-br from-cyan-50 via-white to-sky-50 p-4 shadow-sm">
                {/* ... existing special assigns code ... */}
              </div>
            )}
          </div>

          {/* Queue Column */}
          <div
            className="flex flex-col rounded-lg border border-white/60 bg-white/95 p-6 shadow-md backdrop-blur-sm"
            style={
              isLargeScreen && bedGridHeight
                ? { minHeight: `${bedGridHeight + 80}px` }
                : undefined
            }
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">Queue</h2>
              <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-col 2xl:flex-row gap-2">
                <button
                  onClick={() =>
                    router.push(`/wards/${resolvedWardId}/register`)
                  }
                  disabled={!canRegisterInWard}
                  className="rounded-lg bg-green-600 px-3 py-1 text-sm lg:text-[12px] xl:text-sm text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                >
                  {canRegisterInWard
                    ? "+ Register Patient"
                    : "Registration blocked"}
                </button>
                <Link
                  href={`/wards/${resolvedWardId}/patients`}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-sm lg:text-[12px] xl:text-sm text-white transition-colors hover:bg-blue-700"
                >
                  View all patients
                </Link>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              {ward.patientQueue.length > 0 ? (
                <PatientQueue
                  patients={ward.patientQueue}
                  beds={ward.beds}
                  wards={wards}
                  wardId={resolvedWardId}
                  wardName={ward.name}
                  onPatientAssigned={refreshWard}
                  queueOrderStrategy={ward.queueOrderStrategy}
                  queueOrderMessage={ward.queueOrderMessage}
                  canAssign={canAssignPatients}
                  listMaxHeight={
                    isLargeScreen && bedGridHeight
                      ? Math.max(200, bedGridHeight - 100)
                      : undefined
                  }
                />
              ) : (
                <p className="text-gray-600 py-8">No patients in queue</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
