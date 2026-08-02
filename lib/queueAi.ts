import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import type { Patient, QueuePrediction } from "@/app/types";
import { resolveForecasterProfilePath, resolveMappoModelPath } from "@/lib/get-mappo-model";
import { pythonCommandCandidates } from "@/lib/resolve-python-bin";

interface WardSnapshot {
  wardId: string;
  name: string;
  occupiedBeds: number;
  totalBeds: number;
  queueLength: number;
}

interface PatientHistoryEntry {
  admissionTime?: string | Date;
  priority?: string | number;
  triageLevel?: number;
}

interface QueueAiInput {
  targetWardId: string;
  targetWardName: string;
  targetWardQueue: Patient[];
  targetWardOccupiedBeds?: number;
  targetWardTotalBeds?: number;
  wards: WardSnapshot[];
  patientHistory?: PatientHistoryEntry[];
}

interface QueueAiResult {
  orderedPatients: Patient[];
  strategy: "ai" | "priority";
  message: string;
  queuePrediction?: QueuePrediction;
}

const INFERENCE_TIMEOUT_MS = 45_000;

const priorityOrder = {
  "Triage 1": 0,
  "Triage 2": 1,
  "Triage 3": 2,
  "Triage 4": 3,
  "Triage 5": 4,
};

function resolvePriorityRank(priority: string): number {
  const normalized = String(priority).trim();

  if (normalized in priorityOrder) {
    return priorityOrder[normalized as keyof typeof priorityOrder];
  }

  if (normalized === "Critical") return priorityOrder["Triage 1"];
  if (normalized === "Urgent") return priorityOrder["Triage 3"];
  if (normalized === "Non-urgent") return priorityOrder["Triage 5"];

  return Number.MAX_SAFE_INTEGER;
}

function fallbackPrioritySort(queue: Patient[]): Patient[] {
  return [...queue].sort(
    (a, b) => resolvePriorityRank(a.priority) - resolvePriorityRank(b.priority)
  );
}

function parseExplainJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.lastIndexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("explain.py stdout was not valid JSON");
  }
}

function runPythonCommand(command: string[], input: string) {
  const [exe, ...args] = command;
  return spawnSync(exe, args, {
    input,
    encoding: "utf-8",
    cwd: process.cwd(),
    timeout: INFERENCE_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
}

// ---------------------------------------------------------------------------
// HTTP inference path (used when QUEUE_AI_ENDPOINT env var is set)
// This is the path used on Vercel / production deployments.
// ---------------------------------------------------------------------------

async function reorderViaHttp(input: QueueAiInput): Promise<QueueAiResult> {
  const endpoint = process.env.QUEUE_AI_ENDPOINT!.replace(/\/$/, "");
  const now = new Date();

  const payload = {
    targetWardId: input.targetWardId,
    targetWardTotalBeds: input.targetWardTotalBeds ?? 0,
    targetWardOccupiedBeds: input.targetWardOccupiedBeds ?? 0,
    patientHistory: input.patientHistory,
    // Use "targetWardQueue" key — matches what the FastAPI service expects
    targetWardQueue: input.targetWardQueue.map((patient) => ({
      ...patient,
      patientId: patient.id,
      id: patient.id,
      name: patient.name,
      triageLevel: priorityToTriageLevel(patient.priority),
      waitMinutes: getWaitMinutes(patient, now),
      triageRequested: Boolean(patient.triageRequested),
    })),
  };

  let response: Response;
  try {
    response = await fetch(`${endpoint}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[queueAi] HTTP inference request failed:", message);
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "AI inference service unreachable. Using priority ordering.",
    };
  }

  if (!response.ok) {
    console.error("[queueAi] HTTP inference returned status", response.status);
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: `AI inference service error (${response.status}). Using priority ordering.`,
    };
  }

  let parsed: {
    orderedPatientIds?: string[];
    predictive_analytics?: {
      enabled?: boolean;
      surge_predicted?: boolean;
      pred_load?: number;
      pred_crit?: number;
      expected_arrivals?: number;
      expected_critical_patients?: number;
      horizon_hours?: number;
    };
  };

  try {
    parsed = await response.json();
  } catch {
    console.error("[queueAi] Failed to parse HTTP inference response");
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "AI inference response invalid. Using priority ordering.",
    };
  }

  const order = new Map(
    (parsed.orderedPatientIds || []).map((patientId, index) => [patientId, index])
  );
  const orderedPatients = [...input.targetWardQueue].sort(
    (a, b) =>
      (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );

  const predictive = parsed.predictive_analytics;
  const queuePrediction: QueuePrediction | undefined = predictive
    ? {
        enabled: predictive.enabled !== false,
        load: predictive.pred_load,
        criticalShare: predictive.pred_crit,
        expectedArrivals: predictive.expected_arrivals,
        expectedCriticalPatients: predictive.expected_critical_patients,
        horizonHours: predictive.horizon_hours,
        surgePredicted: Boolean(predictive.surge_predicted),
      }
    : undefined;

  const forecastMessage =
    queuePrediction?.expectedArrivals !== undefined
      ? ` Expected ${queuePrediction.expectedArrivals} patients in the next ${queuePrediction.horizonHours ?? 6} hours; approximately ${queuePrediction.expectedCriticalPatients ?? 0} critical.`
      : "";

  return {
    orderedPatients,
    strategy: "ai",
    message: orderedPatients[0]
      ? `MAPPO+Predictive reordered queue. Top patient: ${orderedPatients[0].name}.${forecastMessage}`
      : `MAPPO+Predictive reordered queue for ${input.targetWardName}.${forecastMessage}`,
    queuePrediction,
  };
}

// ---------------------------------------------------------------------------
// Local subprocess inference path (used when QUEUE_AI_ENDPOINT is not set)
// Works on your local machine where Python + model files exist.
// ---------------------------------------------------------------------------

function reorderViaSubprocess(input: QueueAiInput): QueueAiResult {
  const modelPath = resolveMappoModelPath(true);
  const forecasterProfilePath = resolveForecasterProfilePath();
  const usesSharedPredictiveModel = modelPath?.includes("best_mappo_shared_predictive") ?? false;
  const scriptPath = usesSharedPredictiveModel
    ? path.join(process.cwd(), "scripts", "queue_reorder_infer.py")
    : path.join(process.cwd(), "xai", "scripts", "explain.py");

  if (!modelPath || !existsSync(scriptPath)) {
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "MAPPO model/script missing. Using priority ordering.",
    };
  }

  const usingPredictiveModel = modelPath.includes("predictive");
  const now = new Date();
  const wardSnapshot = {
    modelPath,
    targetWardId: input.targetWardId,
    totalBeds: input.targetWardTotalBeds ?? 0,
    occupiedBeds: input.targetWardOccupiedBeds ?? 0,
    usePredictive: true,
    forecasterProfilePath,
    patientHistory: input.patientHistory,
    queue: input.targetWardQueue.map((patient) => ({
      ...patient,
      patientId: patient.id,
      name: patient.name,
      triageLevel: priorityToTriageLevel(patient.priority),
      waitMinutes: getWaitMinutes(patient, now),
      triageRequested: Boolean(patient.triageRequested),
    })),
  };

  const payload = JSON.stringify(wardSnapshot);
  const attempts = pythonCommandCandidates().map((cmd) => [
    ...cmd,
    scriptPath,
    ...(usesSharedPredictiveModel
      ? []
      : ["--checkpoint", modelPath, "--forecaster-profile", forecasterProfilePath]),
  ]);

  let lastError = "unknown error";

  for (const cmd of attempts) {
    const result = runPythonCommand(cmd, payload);

    if (result.error) {
      lastError = result.error.message;
      continue;
    }

    if (result.signal) {
      lastError = `process killed (${result.signal})`;
      continue;
    }

    if (result.status !== 0) {
      lastError = result.stderr?.trim() || `exit code ${result.status}`;
      continue;
    }

    if (!result.stdout?.trim()) {
      lastError = result.stderr?.trim() || "empty stdout";
      continue;
    }

    try {
      const parsed = parseExplainJson(result.stdout) as {
        error?: string;
        orderedPatientIds?: string[];
        ranked_queue?: Array<{
          patientId?: string;
          name?: string;
          reason?: string;
        }>;
        predictive_analytics?: {
          enabled?: boolean;
          surge_predicted?: boolean;
          pred_load?: number;
          pred_crit?: number;
          expected_arrivals?: number;
          expected_critical_patients?: number;
          horizon_hours?: number;
        };
      };

      if (parsed.error) {
        lastError = parsed.error;
        continue;
      }

      if (usesSharedPredictiveModel) {
        const order = new Map(
          (parsed.orderedPatientIds || []).map((patientId, index) => [patientId, index])
        );
        const orderedPatients = [...input.targetWardQueue].sort(
          (a, b) =>
            (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        );
        const predictive = parsed.predictive_analytics;
        const queuePrediction: QueuePrediction | undefined = predictive
          ? {
              enabled: predictive.enabled !== false,
              load: predictive.pred_load,
              criticalShare: predictive.pred_crit,
              expectedArrivals: predictive.expected_arrivals,
              expectedCriticalPatients: predictive.expected_critical_patients,
              horizonHours: predictive.horizon_hours,
              surgePredicted: Boolean(predictive.surge_predicted),
            }
          : undefined;
        const forecastMessage = queuePrediction?.expectedArrivals !== undefined
          ? ` Expected ${queuePrediction.expectedArrivals} patients in the next ${queuePrediction.horizonHours ?? 6} hours; approximately ${queuePrediction.expectedCriticalPatients ?? 0} critical.`
          : "";

        return {
          orderedPatients,
          strategy: "ai",
          message: orderedPatients[0]
            ? `MAPPO+Predictive reordered queue. Top patient: ${orderedPatients[0].name}.${forecastMessage}`
            : `MAPPO+Predictive reordered queue for ${input.targetWardName}.${forecastMessage}`,
          queuePrediction,
        };
      }

      const order = new Map(
        (parsed.ranked_queue || []).map((patient, index) => [
          patient.patientId || patient.name || String(index),
          index,
        ])
      );
      const reasonByPatientKey = new Map(
        (parsed.ranked_queue || []).map((patient, index) => [
          patient.patientId || patient.name || String(index),
          patient.reason,
        ])
      );
      const orderedPatients = [...input.targetWardQueue]
        .sort((a, b) => {
          const aRank = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bRank = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return aRank - bRank;
        })
        .map((patient) => ({
          ...patient,
          queueReason: reasonByPatientKey.get(patient.id),
        }));

      const predictive = parsed.predictive_analytics;
      const queuePrediction: QueuePrediction | undefined = predictive?.enabled
        ? {
            enabled: true,
            load:
              typeof predictive.pred_load === "number" &&
              Number.isFinite(predictive.pred_load)
                ? predictive.pred_load
                : undefined,
            criticalShare:
              typeof predictive.pred_crit === "number" &&
              Number.isFinite(predictive.pred_crit)
                ? predictive.pred_crit
                : undefined,
            expectedArrivals:
              typeof predictive.expected_arrivals === "number" &&
              Number.isFinite(predictive.expected_arrivals)
                ? predictive.expected_arrivals
                : undefined,
            horizonHours:
              typeof predictive.horizon_hours === "number" &&
              Number.isFinite(predictive.horizon_hours)
                ? predictive.horizon_hours
                : undefined,
            surgePredicted: Boolean(predictive.surge_predicted),
          }
        : undefined;
      const predictiveNote = queuePrediction
        ? queuePrediction.surgePredicted
          ? " Predictive analytics expects heavier critical arrivals; keep the front of the queue ready."
          : " Predictive analytics updated the queue recommendation."
        : "";

      return {
        orderedPatients,
        strategy: "ai",
        message: orderedPatients[0]
          ? `MAPPO${usingPredictiveModel ? "+Predictive" : ""} reordered queue. Top patient: ${orderedPatients[0].name}.${predictiveNote}`
          : `MAPPO${usingPredictiveModel ? "+Predictive" : ""} reordered queue for ${input.targetWardName}.${predictiveNote}`,
        queuePrediction,
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : result.stderr?.trim() || "failed to parse explain.py output";
    }
  }

  console.error("[queueAi] MAPPO subprocess inference failed:", lastError);

  return {
    orderedPatients: fallbackPrioritySort(input.targetWardQueue),
    strategy: "priority",
    message: "MAPPO inference unavailable. Using priority ordering.",
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Reorder the patient queue using AI inference.
 *
 * - When QUEUE_AI_ENDPOINT is set (Vercel / production): calls the Render
 *   FastAPI service via HTTP.
 * - When QUEUE_AI_ENDPOINT is not set (local dev): falls back to spawning
 *   the Python subprocess directly (original behaviour).
 *
 * Always falls back to priority-based sorting if the AI path fails.
 */
export async function reorderQueueWithAi(input: QueueAiInput): Promise<QueueAiResult> {
  const endpoint = process.env.QUEUE_AI_ENDPOINT;

  if (endpoint) {
    return reorderViaHttp(input);
  }

  // Local development — run Python subprocess synchronously
  return reorderViaSubprocess(input);
}

function priorityToTriageLevel(priority: string): number {
  const normalized = String(priority).trim();

  if (normalized in priorityOrder) {
    return priorityOrder[normalized as keyof typeof priorityOrder] + 1;
  }

  if (normalized === "Critical") return 1;
  if (normalized === "Urgent") return 3;
  if (normalized === "Non-urgent") return 5;

  const match = normalized.match(/\d+/);
  return match ? Math.min(5, Math.max(1, Number.parseInt(match[0], 10))) : 5;
}

function getWaitMinutes(patient: Patient, now: Date): number {
  if (
    typeof patient.queueWaitTime === "number" &&
    Number.isFinite(patient.queueWaitTime)
  ) {
    return Math.max(0, Math.floor(patient.queueWaitTime));
  }

  if (!patient.admissionTime) return 0;

  const arrivalMs = new Date(patient.admissionTime).getTime();
  if (Number.isNaN(arrivalMs)) return 0;

  return Math.max(0, Math.floor((now.getTime() - arrivalMs) / 60_000));
}
