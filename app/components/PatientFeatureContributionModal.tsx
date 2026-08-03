"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BarChart3,
  Brain,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import type { Patient } from "@/app/types";

export type RankedPatient = {
  patientId?: string;
  name?: string;
  triageLevel?: number;
  triageRequested?: boolean;
  waitHours?: number;
  priorityScore?: number;
  urgencyContribution?: number;
  waitContribution?: number;
  urgencyShare?: number;
  waitShare?: number;
  reason?: string;
  rank?: number;
};

export type AgentVote = {
  agent_index: number;
  triage_class: string;
  action_index: number;
  proposed_w_t: number;
  proposed_w_w: number;
  negotiation_influence_alpha: number;
  contribution_to_combined_w_t: number;
  contribution_to_combined_w_w: number;
};

export type AgentConfidence = {
  agent_index: number;
  triage_class: string;
  policy_entropy: number;
  confidence_0to1: number;
};

export type ShapCache = {
  feature_names: string[];
  global_importance_per_agent: Record<string, number[]>;
  negotiation_influence_alpha?: Record<string, number>;
};

export type ExplainResponse = {
  explanation_text?: string;
  state_vector?: Record<string, number>;
  predictive_analytics?: {
    enabled?: boolean;
    surge_predicted?: boolean;
    pred_load?: number;
    pred_crit?: number;
    expected_arrivals?: number;
    expected_critical_patients?: number;
    horizon_hours?: number;
  };
  combined_weights?: {
    w_t_urgency?: number;
    w_w_wait?: number;
  };
  agent_votes?: AgentVote[];
  agent_confidence?: AgentConfidence[];
  ranked_queue?: RankedPatient[];
  shap_global_importance_cached?: ShapCache | null;
  shap_error?: string;
  error?: string;
};

interface PatientFeatureContributionModalProps {
  patient: Patient | null;
  wardId: string;
  wardName?: string;
  isOpen: boolean;
  onClose: () => void;
  preloadedExplainData?: ExplainResponse | null;
}

function formatNumber(value?: number, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(digits);
}

function formatFeatureName(rawName: string): string {
  const map: Record<string, string> = {
    bed_occupancy_rate: "Bed Occupancy Rate",
    queue_length_norm: "Queue Length (Norm)",
    triage1_proportion: "Triage 1 (Critical) Share",
    triage2_proportion: "Triage 2 (Emergent) Share",
    triage3_proportion: "Triage 3 (Urgent) Share",
    triage4_proportion: "Triage 4 (Semi-urgent) Share",
    triage5_proportion: "Triage 5 (Non-urgent) Share",
    longest_wait_norm: "Longest Queue Wait (Norm)",
    predicted_arrival_load: "Predicted Arrival Load",
    predicted_critical_share: "Predicted Critical Share",
  };
  return map[rawName] || rawName.replace(/_/g, " ");
}

export default function PatientFeatureContributionModal({
  patient,
  wardId,
  wardName,
  isOpen,
  onClose,
  preloadedExplainData,
}: PatientFeatureContributionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ExplainResponse | null>(
    preloadedExplainData || null
  );
  const [isLoading, setIsLoading] = useState(!preloadedExplainData);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"contributions" | "state">(
    "contributions"
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (preloadedExplainData) {
      setData(preloadedExplainData);
      setIsLoading(false);
      return;
    }

    if (!isOpen || !wardId) return;

    let cancelled = false;
    async function fetchExplanation() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/explain?wardId=${encodeURIComponent(wardId)}&withShap=1`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as ExplainResponse;

        if (cancelled) return;

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Failed to fetch model explanation");
        }

        setData(payload);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load explanation data"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchExplanation();

    return () => {
      cancelled = true;
    };
  }, [isOpen, wardId, preloadedExplainData]);

  // Lock scroll when open & add Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const matchedRankedPatient = useMemo(() => {
    if (!data?.ranked_queue || !patient) return null;
    const targetName = patient.name.trim().toLowerCase();
    const targetMongoId = patient._id ? String(patient._id) : null;
    const targetShortId = patient.id ? String(patient.id) : null;

    return (
      data.ranked_queue.find((rp) => {
        const rpId = rp.patientId ? String(rp.patientId) : null;
        if (rpId && (rpId === targetMongoId || rpId === targetShortId)) return true;
        if (rp.name && rp.name.trim().toLowerCase() === targetName) return true;
        return false;
      }) || null
    );
  }, [patient, data?.ranked_queue]);

  const parsedShares = useMemo(() => {
    if (patient?.queueReason) {
      const urgencyMatch = patient.queueReason.match(/urgency \((\d+)% of score\)/i);
      const waitMatch = patient.queueReason.match(/waiting \((\d+)% of score\)/i);
      const restMatch = patient.queueReason.match(/adding the rest \((\d+)%\)/i);

      if (urgencyMatch) {
        const u = parseInt(urgencyMatch[1], 10);
        return { urgencyShare: u, waitShare: 100 - u };
      }
      if (waitMatch) {
        const w = parseInt(waitMatch[1], 10);
        return { urgencyShare: 100 - w, waitShare: w };
      }
      if (restMatch) {
        const r = parseInt(restMatch[1], 10);
        return { urgencyShare: 100 - r, waitShare: r };
      }
    }
    return null;
  }, [patient?.queueReason]);

  if (!isOpen || !patient || !mounted) return null;

  // 1. Exact wait hours for THIS patient
  const patientWaitHours =
    typeof patient.queueWaitTime === "number" && Number.isFinite(patient.queueWaitTime)
      ? Math.max(0, patient.queueWaitTime / 60)
      : patient.admissionTime
      ? Math.max(0, (Date.now() - new Date(patient.admissionTime).getTime()) / 3600000)
      : matchedRankedPatient?.waitHours ?? 0;

  // 2. Exact triage level number for THIS patient
  const triageLevelNum =
    typeof patient.priority === "string"
      ? parseInt(patient.priority.replace(/\D/g, ""), 10) || 5
      : 5;

  // 3. Active Policy Weights (from backend model or standard MAPPO fallback)
  const w_t = data?.combined_weights?.w_t_urgency ?? 0.6;
  const w_w = data?.combined_weights?.w_w_wait ?? 0.4;

  // 4. Exact per-patient score terms
  const urgencyContrib = (6 - triageLevelNum) * w_t;
  const waitContrib = patientWaitHours * w_w;
  const totalScore = urgencyContrib + waitContrib;

  const calculatedUrgencyShare =
    totalScore > 0 ? (urgencyContrib / totalScore) * 100 : 50;

  const urgencyShare =
    parsedShares?.urgencyShare ??
    matchedRankedPatient?.urgencyShare ??
    calculatedUrgencyShare;

  const waitShare =
    parsedShares?.waitShare ??
    matchedRankedPatient?.waitShare ??
    (100 - urgencyShare);

  const formatPercentageExplanation = (
    triageNum: number,
    waitHours: number,
    urgencyPct: number,
    waitPct: number
  ): string => {
    const roundedUrgency = Math.round(urgencyPct);
    const roundedWait = 100 - roundedUrgency;

    if (roundedUrgency >= roundedWait) {
      return `Prioritized mainly due to Triage ${triageNum} urgency (${roundedUrgency}% of score), with ${waitHours.toFixed(
        1
      )}h waiting adding the rest (${roundedWait}%).`;
    }
    return `Prioritized mainly due to ${waitHours.toFixed(
      1
    )}h waiting (${roundedWait}% of score), with Triage ${triageNum} urgency adding the rest (${roundedUrgency}%).`;
  };

  const patientReason =
    patient.queueReason ||
    formatPercentageExplanation(
      triageLevelNum,
      patientWaitHours,
      urgencyShare,
      waitShare
    );

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-400/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-indigo-500/30 px-2 py-0.5 text-xs font-mono font-semibold text-indigo-200">
                  Patient #{patient.id}
                </span>
                {Boolean(patient.queueRank ?? matchedRankedPatient?.rank) && (
                  <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-400/30">
                    Queue Rank #{patient.queueRank ?? matchedRankedPatient?.rank}
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-xl font-bold tracking-tight">
                {patient.name}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Natural Language Reason Card */}
          <div className="rounded-xl border border-indigo-100 bg-linear-to-r from-indigo-50/70 via-white to-blue-50/70 p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
              <Brain className="h-4 w-4 text-indigo-600" />
              <span>MAPPO Decision Explanation</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-800 font-medium">
              {patientReason}
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                Priority Score
              </p>
              {isLoading ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatNumber(totalScore, 3)}
                </p>
              )}
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                Triage Level
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {patient.priority}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                Wait Time
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatNumber(patientWaitHours, 1)} hrs
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                Active Policy
              </p>
              {isLoading ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <p className="mt-1 text-xs font-mono font-semibold text-indigo-700">
                  w_t {formatNumber(w_t)} / w_w {formatNumber(w_w)}
                </p>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-slate-200">
            <nav className="-mb-px flex space-x-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => setActiveTab("contributions")}
                className={`flex items-center gap-2 border-b-2 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  activeTab === "contributions"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                Score Contributions
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("state")}
                className={`flex items-center gap-2 border-b-2 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  activeTab === "state"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <Activity className="h-4 w-4" />
                State Vector (10 Features)
              </button>
            </nav>
          </div>

          {/* TAB 1: Linear Feature Contributions */}
          {activeTab === "contributions" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Feature Contribution Breakdown (Priority Score Formula)
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Score = w_t * (6 - Triage) + w_w * WaitHours
                  </span>
                </div>

                {/* Progress Bar Visual */}
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 p-4 text-xs font-semibold text-indigo-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Calculating policy weights & contribution shares...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <span className="flex items-center gap-1.5 text-indigo-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                        Urgency Share: {formatNumber(urgencyShare, 1)}%
                      </span>
                      <span className="flex items-center gap-1.5 text-teal-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                        Wait Time Share: {formatNumber(waitShare, 1)}%
                      </span>
                    </div>

                    <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200 flex">
                      <div
                        style={{ width: `${Math.max(2, urgencyShare)}%` }}
                        className="bg-indigo-600 transition-all duration-500"
                        title={`Urgency: ${urgencyShare.toFixed(1)}%`}
                      />
                      <div
                        style={{ width: `${Math.max(2, waitShare)}%` }}
                        className="bg-teal-500 transition-all duration-500"
                        title={`Wait Time: ${waitShare.toFixed(1)}%`}
                      />
                    </div>
                  </div>
                )}

                {/* Individual Feature Breakdown Cards */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-indigo-100 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase text-indigo-700">
                        Urgency Contribution
                      </span>
                      {isLoading ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          ...
                        </span>
                      ) : (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          {formatNumber(urgencyShare, 1)}%
                        </span>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading...</span>
                      </div>
                    ) : (
                      <>
                        <p className="mt-2 text-2xl font-extrabold text-slate-900">
                          +{formatNumber(urgencyContrib, 3)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Formula: (6 - {triageLevelNum}) &times; {w_t.toFixed(2)} ={" "}
                          {urgencyContrib.toFixed(3)}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="rounded-lg border border-teal-100 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase text-teal-700">
                        Wait Time Contribution
                      </span>
                      {isLoading ? (
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">
                          ...
                        </span>
                      ) : (
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">
                          {formatNumber(waitShare, 1)}%
                        </span>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-teal-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading...</span>
                      </div>
                    ) : (
                      <>
                        <p className="mt-2 text-2xl font-extrabold text-slate-900">
                          +{formatNumber(waitContrib, 3)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Formula: {formatNumber(patientWaitHours, 1)}h &times;{" "}
                          {w_w.toFixed(2)} = {waitContrib.toFixed(3)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Disease & Clinical Info Summary */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Patient Clinical Profile Inputs
                </h4>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="flex justify-between rounded-md bg-slate-50 p-2">
                    <span className="text-slate-500">Primary Diagnosis:</span>
                    <span className="font-semibold text-slate-800">
                      {patient.disease}
                    </span>
                  </div>
                  <div className="flex justify-between rounded-md bg-slate-50 p-2">
                    <span className="text-slate-500">Age & Demographics:</span>
                    <span className="font-semibold text-slate-800">
                      {patient.ageGroup} ({patient.age} yrs)
                    </span>
                  </div>
                  {patient.previousDiseases &&
                    patient.previousDiseases.length > 0 && (
                      <div className="flex justify-between rounded-md bg-slate-50 p-2 sm:col-span-2">
                        <span className="text-slate-500">Medical History:</span>
                        <span className="font-semibold text-slate-800">
                          {patient.previousDiseases.join(", ")}
                        </span>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: State Vector Inputs */}
          {activeTab === "state" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Ward State Vector at Decision Time (MAPPO Model Input)
                </h3>
                <span className="text-xs text-slate-500">
                  10 Normalized Features
                </span>
              </div>

              {data?.state_vector ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(data.state_vector).map(([rawKey, val]) => (
                    <div
                      key={rawKey}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <span className="text-xs font-semibold text-slate-700">
                        {formatFeatureName(rawKey)}
                      </span>
                      <span className="rounded-md bg-white px-2 py-1 text-xs font-mono font-bold text-indigo-700 shadow-2xs border border-slate-200">
                        {val.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  State vector snapshot loading or unavailable for this ward.
                </div>
              )}
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center p-4 text-xs font-semibold text-indigo-600 animate-pulse">
              Loading extended model state & negotiation details...
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-500">
            MAPPO Decision Transparency Engine &bull; Layer 1-5 Active
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
