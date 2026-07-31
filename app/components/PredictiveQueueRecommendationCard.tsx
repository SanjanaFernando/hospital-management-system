"use client";

import { AlertTriangle, Clock, Users } from "lucide-react";
import type { QueuePrediction } from "@/app/types";

const LEGACY_PREDICTIVE_LOAD_PATTERN = /Predictive load\s+(\d+(?:\.\d+)?)/i;

interface PredictiveQueueRecommendationCardProps {
  queueLength: number;
  availableBeds: number;
  queueOrderMessage?: string;
  queuePrediction?: QueuePrediction;
  className?: string;
}

function clampPredictionValue(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function resolveQueuePrediction(
  prediction?: QueuePrediction,
  message = ""
): QueuePrediction | null {
  if (prediction?.enabled) {
    return {
      enabled: true,
      load: clampPredictionValue(prediction.load),
      criticalShare: clampPredictionValue(prediction.criticalShare),
      expectedArrivals:
        typeof prediction.expectedArrivals === "number" &&
        Number.isFinite(prediction.expectedArrivals)
          ? Math.max(0, prediction.expectedArrivals)
          : undefined,
      expectedCriticalPatients:
        typeof prediction.expectedCriticalPatients === "number" &&
        Number.isFinite(prediction.expectedCriticalPatients)
          ? Math.max(0, prediction.expectedCriticalPatients)
          : undefined,
      horizonHours:
        typeof prediction.horizonHours === "number" &&
        Number.isFinite(prediction.horizonHours)
          ? Math.max(1, Math.round(prediction.horizonHours))
          : undefined,
      surgePredicted: Boolean(prediction.surgePredicted),
    };
  }

  const loadMatch = message.match(LEGACY_PREDICTIVE_LOAD_PATTERN);
  const surgePredicted = /critical surge|surge predicted|likely critical surge/i.test(
    message
  );

  if (!loadMatch && !surgePredicted) return null;

  return {
    enabled: true,
    load: loadMatch
      ? clampPredictionValue(Number.parseFloat(loadMatch[1]))
      : undefined,
    surgePredicted,
  };
}

function resolvePredictionTone(prediction: QueuePrediction) {
  if (prediction.surgePredicted) {
    return {
      label: "Surge watch",
      cardClass:
        "border-rose-200 bg-linear-to-br from-rose-50 via-white to-orange-50",
      badgeClass: "bg-rose-100 text-rose-700",
      iconClass: "bg-rose-100 text-rose-600",
      advice:
        "A heavier critical-arrival pattern is possible, so protect the top queue positions for fast assignment.",
    };
  }

  const load = prediction.load ?? 0;

  if (load >= 0.65) {
    return {
      label: "High demand",
      cardClass:
        "border-orange-200 bg-linear-to-br from-orange-50 via-white to-amber-50",
      badgeClass: "bg-orange-100 text-orange-700",
      iconClass: "bg-orange-100 text-orange-600",
      advice:
        "Incoming demand looks high, so keep the front of the queue ready before beds open.",
    };
  }

  if (load >= 0.35) {
    return {
      label: "Moderate demand",
      cardClass:
        "border-blue-200 bg-linear-to-br from-blue-50 via-white to-indigo-50",
      badgeClass: "bg-blue-100 text-blue-700",
      iconClass: "bg-blue-100 text-blue-600",
      advice:
        "Incoming demand is moderate; continue the MAPPO order and prepare the next patients early.",
    };
  }

  return {
    label: "Low demand",
    cardClass:
      "border-emerald-200 bg-linear-to-br from-emerald-50 via-white to-teal-50",
    badgeClass: "bg-emerald-100 text-emerald-700",
    iconClass: "bg-emerald-100 text-emerald-600",
    advice:
      "Incoming demand looks manageable, so standard priority flow should be enough.",
  };
}

function resolveFrontQueueCount(
  queueLength: number,
  prediction: QueuePrediction,
  availableBeds: number
) {
  if (queueLength <= 0) return 0;

  const load = prediction.load;
  const loadBasedCount =
    typeof load === "number"
      ? Math.ceil(queueLength * Math.max(load, 0.15))
      : 1;
  const surgeCount = prediction.surgePredicted
    ? Math.ceil(queueLength * 0.5)
    : loadBasedCount;
  const bedReadyCount = availableBeds > 0 ? availableBeds : 1;

  return Math.min(queueLength, Math.max(1, surgeCount, bedReadyCount));
}

function formatPatientCount(count: number) {
  return `${count} ${count === 1 ? "patient" : "patients"}`;
}

function formatExpectedArrivals(count?: number) {
  if (typeof count !== "number") return "Tracking";
  if (count > 0 && count < 1) return "<1 patient";

  const rounded = Math.round(count);
  return `About ${rounded} ${rounded === 1 ? "patient" : "patients"}`;
}

function formatCriticalArrivals(
  criticalShare?: number,
  expectedArrivals?: number,
  expectedCriticalPatients?: number,
  surgePredicted = false
) {
  if (typeof expectedCriticalPatients === "number") {
    return `Approximately ${formatExpectedArrivals(expectedCriticalPatients).toLowerCase()}`;
  }

  if (typeof criticalShare === "number") {
    const percentage = `${Math.round(criticalShare * 100)}% of arrivals`;

    if (typeof expectedArrivals === "number" && Number.isFinite(expectedArrivals)) {
      const estimatedCount = Math.round(expectedArrivals * criticalShare);
      return `${percentage} (${formatExpectedArrivals(estimatedCount).toLowerCase()})`;
    }

    return percentage;
  }

  return surgePredicted ? "High risk" : "Tracking";
}

export default function PredictiveQueueRecommendationCard({
  queueLength,
  availableBeds,
  queueOrderMessage = "",
  queuePrediction,
  className = "",
}: PredictiveQueueRecommendationCardProps) {
  if (queueLength <= 0) return null;

  const prediction = resolveQueuePrediction(queuePrediction, queueOrderMessage);

  if (!prediction) {
    return queueOrderMessage ? (
      <div
        className={`rounded-2xl border border-blue-100 bg-white/90 p-4 text-xs leading-relaxed text-blue-700 shadow-sm ${className}`}
      >
        {queueOrderMessage}
      </div>
    ) : null;
  }

  const tone = resolvePredictionTone(prediction);
  const frontQueueCount = resolveFrontQueueCount(
    queueLength,
    prediction,
    availableBeds
  );
  const horizonHours = prediction.horizonHours ?? 6;

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${tone.cardClass} ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-full p-2 ${tone.iconClass}`}>
          {prediction.surgePredicted ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Predictive Queue Recommendation
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.badgeClass}`}
            >
              {tone.label}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-white/75 px-3 py-2 ring-1 ring-black/5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <Clock className="h-3 w-3" />
                Expected next {horizonHours}h
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {formatExpectedArrivals(prediction.expectedArrivals)}
              </p>
            </div>
            <div className="rounded-xl bg-white/75 px-3 py-2 ring-1 ring-black/5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <Users className="h-3 w-3" />
                Prepare first
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {formatPatientCount(frontQueueCount)}
              </p>
            </div>
            <div className="rounded-xl bg-white/75 px-3 py-2 ring-1 ring-black/5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <AlertTriangle className="h-3 w-3" />
                Critical next {horizonHours}h
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {formatCriticalArrivals(
                  prediction.criticalShare,
                  prediction.expectedArrivals,
                  prediction.expectedCriticalPatients,
                  prediction.surgePredicted
                )}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
