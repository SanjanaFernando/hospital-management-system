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
                Agent negotiation
              </h3>
              <p className="text-sm text-slate-500">
                Each triage agent proposes urgency and wait weights; the fixed alpha values determine influence.
              </p>
            </div>

            {agentChartData.length > 0 ? (
              <ChartContainer
                config={{
                  urgency_weight: { label: "Urgency weight", color: "#2563eb" },
                  wait_weight: { label: "Wait weight", color: "#0f766e" },
                  influence_pct: { label: "Influence %", color: "#8b5cf6" },
                }}
                className="h-[320px] w-full"
              >
                <BarChart data={agentChartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="agent" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" domain={[0, 1]} tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend content={<ChartLegendContent />} />
                  <Bar yAxisId="left" dataKey="urgency_weight" radius={[6, 6, 0, 0]} fill="var(--color-urgency_weight)" />
                  <Bar yAxisId="left" dataKey="wait_weight" radius={[6, 6, 0, 0]} fill="var(--color-wait_weight)" />
                  <Bar yAxisId="right" dataKey="influence_pct" radius={[6, 6, 0, 0]} fill="var(--color-influence_pct)" />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-slate-500">No agent vote data returned.</p>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setShowShap((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Cached SHAP feature importance
                </h3>
                <p className="text-sm text-slate-500">
                  Precomputed offline, never recomputed live on request.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {showShap ? "Hide" : "Show"}
              </span>
            </button>

            {showShap && (
              <div className="mt-4 space-y-4">
                {data?.shap_error && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {data.shap_error}
                  </div>
                )}

                {shapRows.length > 0 ? (
                  shapRows.map((agentRow) => (
                    <div key={agentRow.agentKey} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">{agentRow.agentKey}</p>
                      <div className="mt-3 space-y-3">
                        {agentRow.features.map((feature) => (
                          <div key={feature.feature}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-600">
                              <span className="font-medium text-slate-700">{feature.feature}</span>
                              <span>{feature.value.toExponential(2)}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${feature.width}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No cached SHAP summary found.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}