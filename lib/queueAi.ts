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

function computeFallbackPriorityScore(patient: Patient, nowMs: number = Date.now()): number {
  const triageNum =
    typeof patient.priority === "string"
      ? parseInt(patient.priority.replace(/\D/g, ""), 10) || 5
      : typeof patient.priority === "number"
      ? patient.priority
      : 5;

  let waitMinutes = 0;
  if (typeof patient.queueWaitTime === "number" && Number.isFinite(patient.queueWaitTime)) {
    waitMinutes = Math.max(0, patient.queueWaitTime);
  } else if (patient.admissionTime) {
    const arr = new Date(patient.admissionTime).getTime();
    if (!Number.isNaN(arr)) {
      waitMinutes = Math.max(0, (nowMs - arr) / 60000);
    }
  }

  const waitHours = waitMinutes / 60;
  // Primary: Triage level (T1 gets 5000+, T2 gets 4000+, T3 gets 3000+, T4 gets 2000+, T5 gets 1000+)
  // Secondary: Wait hours (longer wait adds to score within same triage level)
  return (6 - triageNum) * 1000 + waitHours;
}

export function fallbackPrioritySort(queue: Patient[]): Patient[] {
  const now = Date.now();
  return [...queue]
    .sort((a, b) => {
      const rankA = resolvePriorityRank(a.priority);
      const rankB = resolvePriorityRank(b.priority);
      if (rankA !== rankB) {
        return rankA - rankB; // Lower rank number = higher triage urgency (Triage 1 first)
      }
      const waitA = getWaitMinutes(a, new Date(now));
      const waitB = getWaitMinutes(b, new Date(now));
      return waitB - waitA; // Longer wait first
    })
    .map((patient, idx) => ({
      ...patient,
      queueRank: idx + 1,
    }));
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

function getPatientRank(orderMap: Map<string, number>, patient: Patient): number {
  if (patient._id && orderMap.has(String(patient._id))) {
    return orderMap.get(String(patient._id))!;
  }
  if (patient.id && orderMap.has(String(patient.id))) {
    return orderMap.get(String(patient.id))!;
  }
  if (patient.name && orderMap.has(patient.name)) {
    return orderMap.get(patient.name)!;
  }
  return Number.MAX_SAFE_INTEGER;
}

function getPatientReason(
  reasonMap: Map<string, string>,
  patient: Patient
): string | undefined {
  if (patient._id && reasonMap.has(String(patient._id))) {
    return reasonMap.get(String(patient._id));
  }
  if (patient.id && reasonMap.has(String(patient.id))) {
    return reasonMap.get(String(patient.id));
  }
  if (patient.name && reasonMap.has(patient.name)) {
    return reasonMap.get(patient.name);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// HTTP inference path (used when QUEUE_AI_ENDPOINT env var is set)
// This is the path used on Vercel / production deployments.
// ---------------------------------------------------------------------------

async function reorderViaHttp(input: QueueAiInput): Promise<QueueAiResult> {
  // Call /explain instead of /reorder so queue ordering comes from the same
  // best_mappo_hospital.pth (5-actor) model that the XAI panel uses.
  // This guarantees the displayed priority scores match the actual queue order.
  const endpoint = process.env.QUEUE_AI_ENDPOINT!.replace(/\/$/, "");
  const now = new Date();

  const wardSnapshot = {
    totalBeds: input.targetWardTotalBeds ?? 0,
    occupiedBeds: input.targetWardOccupiedBeds ?? 0,
    usePredictive: true,
    patientHistory: input.patientHistory,
    queue: input.targetWardQueue.map((patient, queueIndex) => ({
      ...patient,
      patientId: patient._id ? String(patient._id) : String(patient.id),
      name: patient.name,
      __queueIndex: queueIndex,
      triageLevel: priorityToTriageLevel(patient.priority),
      waitMinutes: getWaitMinutes(patient, now),
      triageRequested: Boolean(patient.triageRequested),
    })),
  };

  let response: Response;
  try {
    response = await fetch(`${endpoint}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wardSnapshot),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[queueAi] HTTP explain request failed:", message);
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "AI inference service unreachable. Using priority ordering.",
    };
  }

  if (!response.ok) {
    console.error("[queueAi] HTTP explain returned status", response.status);
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: `AI inference service error (${response.status}). Using priority ordering.`,
    };
  }

  let parsed: {
    ranked_queue?: Array<{
      patientId?: string;
      name?: string;
      reason?: string;
      priorityScore?: number;
      __queueIndex?: number;
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

  try {
    parsed = await response.json();
  } catch {
    console.error("[queueAi] Failed to parse HTTP explain response");
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "AI inference response invalid. Using priority ordering.",
    };
  }

  const rankedQueue = parsed.ranked_queue || [];
  if (rankedQueue.length === 0) {
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "AI returned empty ranking. Using priority ordering.",
    };
  }

  // Build score maps keyed by __queueIndex (most reliable) with name fallback
  const scoreByIdx = new Map<number, number>();
  const reasonByIdx = new Map<number, string>();
  const scoreByName = new Map<string, number>();
  const reasonByName = new Map<string, string>();

  rankedQueue.forEach((entry) => {
    const score = entry.priorityScore ?? 0;
    const nameLower = entry.name?.trim().toLowerCase();
    if (typeof entry.__queueIndex === "number") {
      scoreByIdx.set(entry.__queueIndex, score);
      if (entry.reason) reasonByIdx.set(entry.__queueIndex, entry.reason);
    }
    if (nameLower) {
      scoreByName.set(nameLower, score);
      if (entry.reason) reasonByName.set(nameLower, entry.reason);
    }
  });

  const orderedPatients = input.targetWardQueue
    .map((patient, queueIndex) => {
      const nameLower = patient.name?.trim().toLowerCase() ?? "";
      const score =
        scoreByIdx.get(queueIndex) ??
        (nameLower ? scoreByName.get(nameLower) : undefined) ??
        0;
      const reason =
        reasonByIdx.get(queueIndex) ??
        (nameLower ? reasonByName.get(nameLower) : undefined);
      return { patient, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ patient, reason }, idx) => ({
      ...patient,
      queueRank: idx + 1,
      queueReason: reason || patient.queueReason,
    }));

  const predictive = parsed.predictive_analytics;
  const queuePrediction = predictive?.enabled
    ? {
        enabled: true,
        load: typeof predictive.pred_load === "number" ? predictive.pred_load : undefined,
        criticalShare: typeof predictive.pred_crit === "number" ? predictive.pred_crit : undefined,
        expectedArrivals: typeof predictive.expected_arrivals === "number" ? predictive.expected_arrivals : undefined,
        expectedCriticalPatients: typeof predictive.expected_critical_patients === "number" ? predictive.expected_critical_patients : undefined,
        horizonHours: typeof predictive.horizon_hours === "number" ? predictive.horizon_hours : undefined,
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

// ---------------------------------------------------------------------------
// Local subprocess inference path (used when QUEUE_AI_ENDPOINT is not set)
// Works on your local machine where Python + model files exist.
// ---------------------------------------------------------------------------

function reorderViaSubprocess(input: QueueAiInput): QueueAiResult {
  // Use the explain-compatible baseline checkpoint (best_mappo_hospital.pth).
  // The explain_engine.py load_mappo() expects 5 separate actor_0..actor_4 keys
  // which only the baseline (non-predictive) checkpoint provides. The predictive
  // shared-actor checkpoint (best_mappo_shared_predictive.pth) uses net.*.weight
  // keys and cannot be loaded by load_mappo() — passing it would silently fall
  // through to fallbackPrioritySort without any warning.
  const modelPath = resolveMappoModelPath(false); // false = prefer best_mappo_hospital.pth
  const forecasterProfilePath = resolveForecasterProfilePath();
  const scriptPath = path.join(process.cwd(), "xai", "scripts", "explain.py");

  if (!modelPath || !existsSync(scriptPath)) {
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "MAPPO model/script missing. Using priority ordering.",
    };
  }

  const usingPredictiveModel = modelPath.includes("predictive");
  const now = new Date();

  // Tag every patient with its 0-based position so we can match back reliably
  // regardless of how IDs are serialised through JSON / Python.
  const taggedQueue = input.targetWardQueue.map((patient, queueIndex) => ({
    ...patient,
    patientId: patient._id ? String(patient._id) : String(patient.id),
    id: patient.id,
    name: patient.name,
    __queueIndex: queueIndex,
    triageLevel: priorityToTriageLevel(patient.priority),
    waitMinutes: getWaitMinutes(patient, now),
    triageRequested: Boolean(patient.triageRequested),
  }));

  const wardSnapshot = {
    modelPath,
    targetWardId: input.targetWardId,
    totalBeds: input.targetWardTotalBeds ?? 0,
    occupiedBeds: input.targetWardOccupiedBeds ?? 0,
    usePredictive: true,
    forecasterProfilePath,
    patientHistory: input.patientHistory,
    queue: taggedQueue,
  };

  const payload = JSON.stringify(wardSnapshot);
  const attempts = pythonCommandCandidates().map((cmd) => [
    ...cmd,
    scriptPath,
    "--checkpoint",
    modelPath,
    "--forecaster-profile",
    forecasterProfilePath,
  ]);

  let lastError = "unknown error";

  for (const cmd of attempts) {
    const result = runPythonCommand(cmd, payload);

    if (result.error) { lastError = result.error.message; continue; }
    if (result.signal) { lastError = `process killed (${result.signal})`; continue; }
    if (result.status !== 0) { lastError = result.stderr?.trim() || `exit code ${result.status}`; continue; }
    if (!result.stdout?.trim()) { lastError = result.stderr?.trim() || "empty stdout"; continue; }

    try {
      type RankedEntry = {
        patientId?: string;
        name?: string;
        reason?: string;
        priorityScore?: number;
        __queueIndex?: number;
      };
      const parsed = parseExplainJson(result.stdout) as {
        error?: string;
        ranked_queue?: RankedEntry[];
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

      if (parsed.error) { lastError = parsed.error; continue; }

      const rankedQueue = parsed.ranked_queue || [];

      // Build a score/reason map keyed by __queueIndex (most reliable)
      // with name fallback for backwards compat.
      const scoreByIdx = new Map<number, number>();
      const reasonByIdx = new Map<number, string>();
      const scoreByName = new Map<string, number>();
      const reasonByName = new Map<string, string>();

      rankedQueue.forEach((entry) => {
        const score = entry.priorityScore ?? 0;
        const nameLower = entry.name?.trim().toLowerCase();
        if (typeof entry.__queueIndex === "number") {
          scoreByIdx.set(entry.__queueIndex, score);
          if (entry.reason) reasonByIdx.set(entry.__queueIndex, entry.reason);
        }
        if (nameLower) {
          scoreByName.set(nameLower, score);
          if (entry.reason) reasonByName.set(nameLower, entry.reason);
        }
      });

      // Sort original patients by MAPPO priority score DESCENDING.
      // Use __queueIndex match first (exact), then name match, then fallback score.
      const orderedPatients = input.targetWardQueue
        .map((patient, queueIndex) => {
          const nameLower = patient.name?.trim().toLowerCase() ?? "";
          const score =
            scoreByIdx.get(queueIndex) ??
            (nameLower ? scoreByName.get(nameLower) : undefined) ??
            computeFallbackPriorityScore(patient, now.getTime());
          const reason =
            reasonByIdx.get(queueIndex) ??
            (nameLower ? reasonByName.get(nameLower) : undefined);
          return { patient, score, reason };
        })
        .sort((a, b) => b.score - a.score)  // Highest priority score first
        .map(({ patient, reason }, idx) => ({
          ...patient,
          queueRank: idx + 1,
          queueReason: reason || patient.queueReason,
        }));

      const predictive = parsed.predictive_analytics;
      const queuePrediction: QueuePrediction | undefined = predictive?.enabled
        ? {
            enabled: true,
            load: typeof predictive.pred_load === "number" && Number.isFinite(predictive.pred_load) ? predictive.pred_load : undefined,
            criticalShare: typeof predictive.pred_crit === "number" && Number.isFinite(predictive.pred_crit) ? predictive.pred_crit : undefined,
            expectedArrivals: typeof predictive.expected_arrivals === "number" && Number.isFinite(predictive.expected_arrivals) ? predictive.expected_arrivals : undefined,
            horizonHours: typeof predictive.horizon_hours === "number" && Number.isFinite(predictive.horizon_hours) ? predictive.horizon_hours : undefined,
            surgePredicted: Boolean(predictive.surge_predicted),
          }
        : undefined;

      const predictiveNote = queuePrediction?.surgePredicted
        ? " Predictive analytics expects heavier critical arrivals; keep the front of the queue ready."
        : queuePrediction
        ? " Predictive analytics updated the queue recommendation."
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
      lastError = error instanceof Error ? error.message : result.stderr?.trim() || "failed to parse explain.py output";
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
