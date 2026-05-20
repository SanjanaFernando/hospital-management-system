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
  const bedGridRef = useRef<HTMLDivElement | null>(null);
  const [bedGridHeight, setBedGridHeight] = useState<number | undefined>();

  useEffect(() => setWard(initialWard), [initialWard]);
  useEffect(() => setWards(initialWards), [initialWards]);

  useEffect(() => {
    const updateBedGridHeight = () => {
      const nextHeight = bedGridRef.current?.offsetHeight;
      if (nextHeight) {
        setBedGridHeight(nextHeight);
      }
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
  }, [ward.beds.length]);

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

  const handleBedClick = (bed: Bed) => {
    if (!wardAccessAllowed) {
      setError("You do not have access to this ward.");
      return;
    }

    router.push(`/wards/${resolvedWardId}/${bed.id}`);
  };

  const refreshWard = useCallback(async () => {
    const wardData = await getWardWithPatients(resolvedWardId);
    if (wardData) {
      setWard(wardData);
    }
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
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setIsAddingBed(false);
    }
  };

  if (!ward) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-md">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">
            Ward not found
          </h1>
          <p className="text-gray-600">
            The ward you requested does not exist.
          </p>
          {error && <p className="mt-2 text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  if (!wardAccessAllowed) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-md">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">
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
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-700"
          >
            <ChevronLeft size={20} />
            Back to Dashboard
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">Beds</h2>
              <div className="relative group">
                <button
                  disabled={isAddingBed || !canManageWard}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {!canManageWard
                    ? "Not allowed"
                    : isAddingBed
                      ? "Adding..."
                      : "+ Add Bed"}
                </button>
                <div className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-xl border border-gray-400 bg-white opacity-0 invisible transition-all duration-200 group-hover:visible group-hover:opacity-100">
                  <button
                    onClick={() => handleAddBed("normal")}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-blue-400 transition hover:bg-blue-50 hover:text-blue-600"
                  >
                    🛏️ Normal Bed
                  </button>
                  <button
                    onClick={() => handleAddBed("icu")}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    ❤️ ICU Bed
                  </button>
                </div>
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

            {canCrossWardAssign && (
              <div className="mt-6 rounded-2xl border border-cyan-200 bg-linear-to-br from-cyan-50 via-white to-sky-50 p-4 shadow-sm ring-1 ring-cyan-100/60">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-950">
                      Special Assigns
                    </h3>
                    <p className="text-sm text-cyan-700">
                      Patients transferred here from this ward, shown in a
                      compact grid.
                    </p>
                  </div>
                  <span className="flex w-full max-w-25 justify-center bg-cyan-100 px-1 py-1 text-xs font-semibold text-cyan-800">
                    {specialAssigns.length} transfer
                  </span>
                </div>

                {specialAssigns.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {specialAssigns.map((assign) => (
                      <Link
                        key={assign.patient.id}
                        href={`/wards/${assign.targetWardId}/${assign.targetBed.id}`}
                        className="group rounded-xl border border-cyan-200 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:shadow-md"
                      >
                        <p className="font-semibold text-gray-900">
                          {assign.patient.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                          Now in {assign.targetWardName} -{" "}
                          {assign.targetBed.type === "ICU"
                            ? `ICU Bed ${assign.targetBed.bedNumber}`
                            : `Bed ${assign.targetBed.bedNumber}`}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-cyan-200 bg-white/70 p-4 text-sm text-cyan-800">
                    No transferred patients from this ward.
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="flex flex-col rounded-lg bg-white p-6 shadow-md"
            style={
              bedGridHeight
                ? {
                    height: `${bedGridHeight + 100}px`,
                  }
                : undefined
            }
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">Queue</h2>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    router.push(`/wards/${resolvedWardId}/register`)
                  }
                  disabled={!canRegisterInWard}
                  className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                >
                  {canRegisterInWard
                    ? "+ Register Patient"
                    : "Registration blocked"}
                </button>
                <Link
                  href={`/wards/${resolvedWardId}/patients`}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700"
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
