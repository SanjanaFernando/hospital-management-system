"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Ward } from "@/app/types";
import PatientQueue from "@/app/components/PatientQueue";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import PredictiveQueueRecommendationCard from "@/app/components/PredictiveQueueRecommendationCard";
import ExplanationPanel from "@/components/ui/explanation-panel";
import {
  getWardWithPatients,
  getWardsWithPatients,
} from "@/app/actions/wardActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canAccessWard, canAssignOrDischargePatient } from "@/lib/rbac";
import {
  CLIENT_CACHE_TTL,
  clearClientCache,
  getClientCache,
  setClientCache,
} from "@/app/utils/clientCache";

export default function WardQueuePage() {
  const params = useParams<{ wardId: string }>();
  const wardId = params?.wardId;
  const { session } = useAuthSession();

  const [ward, setWard] = useState<Ward | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWard = useCallback(async (bypassCache = false) => {
    if (!wardId) return;
    const cacheKey = `ward:${wardId}`;

    if (!bypassCache) {
      const cachedWard = getClientCache<Ward>(cacheKey, CLIENT_CACHE_TTL.ward);

      if (cachedWard) {
        setWard(cachedWard);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    } else {
      clearClientCache();
    }

    setError("");

    try {
      const wardData = await getWardWithPatients(wardId, bypassCache);
      if (!wardData) {
        throw new Error("Ward not found");
      }
      setWard(wardData);
      setClientCache(cacheKey, wardData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (!bypassCache) {
        const cachedWard = getClientCache<Ward>(cacheKey, CLIENT_CACHE_TTL.ward);
        if (cachedWard) {
          setError(`Showing cached ward data - ${message}`);
          return;
        }
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [wardId]);

  const loadWards = useCallback(async () => {
    if (session.role !== "admin" && session.role !== "consultant_doctor") {
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
  }, [session.role]);

  useEffect(() => {
    void loadWard();
    void loadWards();
  }, [loadWard, loadWards]);

  const handlePatientAssigned = useCallback(async () => {
    clearClientCache();
    await Promise.all([loadWard(true), loadWards()]);
  }, [loadWard, loadWards]);

  if (isLoading) {
    return <MedicalCrossLoader message="Loading Queue..." fullScreen />;
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
      <div className="max-w-4xl mx-auto">
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
                Patient Queue
              </h1>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-6 rounded-lg bg-white p-6 shadow-md sm:p-8">
          <ExplanationPanel
            wardId={ward.wardId || ward.id}
            wardName={ward.name}
            queueCount={ward.patientQueue?.length || 0}
          />
          <PredictiveQueueRecommendationCard
            queueLength={ward.patientQueue?.length || 0}
            availableBeds={
              ward.beds?.filter((bed) => bed.status === "available").length || 0
            }
            queueOrderMessage={ward.queueOrderMessage}
            queuePrediction={ward.queuePrediction}
          />
          <PatientQueue
            patients={ward.patientQueue || []}
            beds={ward.beds || []}
            wards={wards}
            wardId={ward.wardId || ward.id}
            wardName={ward.name}
            onPatientAssigned={handlePatientAssigned}
            queueOrderStrategy={ward.queueOrderStrategy}
            queueExplainSnapshot={ward.queueExplainSnapshot}
            canAssign={canAssignPatients}
          />
        </div>
      </div>
    </div>
  );
}
