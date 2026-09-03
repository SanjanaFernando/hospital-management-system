"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import PatientFeatureContributionModal from "@/app/components/PatientFeatureContributionModal";
import type { Patient } from "@/app/types";

type RankedPatient = {
  patientId?: string;
  name?: string;
  triageLevel?: number;
  waitHours?: number;
  priorityScore?: number;
  urgencyContribution?: number;
  waitContribution?: number;
  urgencyShare?: number;
  waitShare?: number;
  rank?: number;
};

type AgentVote = {
  agent_index: number;
  triage_class: string;
  action_index: number;
  proposed_w_t: number;
  proposed_w_w: number;
  negotiation_influence_alpha: number;
  contribution_to_combined_w_t: number;
  contribution_to_combined_w_w: number;
};

type AgentConfidence = {
  agent_index: number;
  triage_class: string;
  action_index: number;
  action_confidence_0to1?: number;
  policy_entropy: number;
  confidence_0to1: number;
};

type ShapCache = {
  feature_names: string[];
  global_importance_per_agent: Record<string, number[]>;
  negotiation_influence_alpha?: Record<string, number>;
};

type ExplainResponse = {
  explanation_text?: string;
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

interface ExplanationPanelProps {
  wardId: string;
  wardName: string;
  queueCount: number;
}

function formatNumber(value?: number, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(digits);
}

function normalizeShapRows(shapCache?: ShapCache | null) {
  if (!shapCache?.global_importance_per_agent) return [];

  return Object.entries(shapCache.global_importance_per_agent).map(
    ([agentKey, values]) => {
      const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1e-9);
      const features = (shapCache.feature_names || []).map((feature, index) => ({
        feature,
        value: values[index] ?? 0,
      }));

      return {
        agentKey,
        features: features
          .filter((entry) => entry.feature && entry.feature !== "pad_0" && entry.feature !== "pad_1")
          .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
          .slice(0, 4)
          .map((entry) => ({
            ...entry,
            width: Math.max((Math.abs(entry.value) / maxAbs) * 100, 6),
          })),
      };
    }
  );
}

export default function ExplanationPanel({
  wardId,
  wardName,
  queueCount,
}: ExplanationPanelProps) {
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showShap, setShowShap] = useState(false);
  const [selectedPatientModal, setSelectedPatientModal] = useState<Patient | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadExplanation() {
      if (!wardId) return;

      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/explain?wardId=${encodeURIComponent(wardId)}&withShap=1`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as ExplainResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Failed to load explanation");
        }

        setData(payload);
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load explanation"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadExplanation();

    return () => {
      cancelled = true;
    };
  }, [wardId]);

  const agentChartData = useMemo(() => {
    return (data?.agent_votes || []).map((agent) => ({
      agent: agent.triage_class,
      urgency_weight: agent.proposed_w_t,
      wait_weight: agent.proposed_w_w,
      influence_pct: agent.negotiation_influence_alpha * 100,
    }));
  }, [data]);

  const shapRows = useMemo(() => normalizeShapRows(data?.shap_global_importance_cached), [data]);

  const topPatient = data?.ranked_queue?.[0];
  const combinedWeights = data?.combined_weights;

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            MAPPO explanation
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            Why this queue is ordered this way
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {wardName} {queueCount > 0 ? `- ${queueCount} patients in queue` : "- queue empty"}
          </p>
        </div>
        <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          Layers 1-5 enabled
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span>Natural language summary</span>
              {combinedWeights && (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-700">
                  w_t {formatNumber(combinedWeights.w_t_urgency)} / w_w {formatNumber(combinedWeights.w_w_wait)}
                </span>
              )}
            </div>
            <p className="text-sm leading-6 text-slate-700">
              {data?.explanation_text || "No explanation text was returned."}
            </p>
            {data?.agent_confidence && data.agent_confidence.length > 0 && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Action confidence
                  </p>
                  <p className="text-xs text-slate-500">Policy certainty by agent</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.agent_confidence.map((agent) => {
                    const vote = data.agent_votes?.find(
                      (candidate) => candidate.agent_index === agent.agent_index
                    );
                    const actionIndex = agent.action_index ?? vote?.action_index;
                    const confidenceValue =
                      agent.action_confidence_0to1 ?? agent.confidence_0to1;
                    const confidence = Math.max(
                      0,
                      Math.min(100, confidenceValue * 100)
                    );

                    return (
                      <div key={agent.agent_index}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-700">
                            {agent.triage_class}
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatNumber(confidence, 0)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-[width]"
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Selected action {actionIndex ?? "-"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {topPatient && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Top patient
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {topPatient.rank ? `#${topPatient.rank} ` : ""}{topPatient.name || "Unknown"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Priority score
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatNumber(topPatient.priorityScore)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Wait time
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatNumber(topPatient.waitHours)} hrs
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Priority decomposition
              </h3>
              <p className="text-sm text-slate-500">
                Exact score breakdown used to rank the queue.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2">Triage</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Urgency share</th>
                    <th className="px-3 py-2">Wait share</th>
                    <th className="px-3 py-2 text-center">XAI Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.ranked_queue || []).map((patient) => (
                    <tr key={patient.patientId || `${patient.rank}-${patient.name}`} className="rounded-xl bg-slate-50 text-slate-700">
                      <td className="px-3 py-3 font-semibold text-slate-900">#{patient.rank ?? "-"}</td>
                      <td className="px-3 py-3">{patient.name || "Unknown"}</td>
                      <td className="px-3 py-3">Triage {patient.triageLevel ?? "-"}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {formatNumber(patient.priorityScore)}
                      </td>
                      <td className="px-3 py-3">{formatNumber(patient.urgencyShare, 1)}%</td>
                      <td className="px-3 py-3">{formatNumber(patient.waitShare, 1)}%</td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPatientModal({
                              id: patient.patientId || "",
                              _id: patient.patientId,
                              name: patient.name || "Unknown",
                              priority: `Triage ${patient.triageLevel ?? 5}` as any,
                              age: 0,
                              ageGroup: "Adult",
                              disease: "Emergency",
                              admissionTime: new Date(Date.now() - (patient.waitHours || 0) * 3600000),
                            })
                          }
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-white hover:bg-amber-600 hover:scale-110 transition-all shadow-xs cursor-pointer"
                          title="View XAI Feature Contribution Breakdown for this patient"
                        >
                          !
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedPatientModal && (
        <PatientFeatureContributionModal
          patient={selectedPatientModal}
          wardId={wardId}
          wardName={wardName}
          isOpen={Boolean(selectedPatientModal)}
          onClose={() => setSelectedPatientModal(null)}
          preloadedExplainData={data}
        />
      )}
    </section>
  );
}