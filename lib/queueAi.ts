import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { Patient } from "@/app/types";

interface WardSnapshot {
  wardId: string;
  name: string;
  occupiedBeds: number;
  totalBeds: number;
  queueLength: number;
}

interface QueueAiInput {
  targetWardId: string;
  targetWardName: string;
  targetWardQueue: Patient[];
  targetWardOccupiedBeds?: number;
  targetWardTotalBeds?: number;
  wards: WardSnapshot[];
}

interface QueueAiResult {
  orderedPatients: Patient[];
  strategy: "ai" | "priority";
  message: string;
}

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

function runPythonCommand(command: string[], input: string) {
  const [exe, ...args] = command;
  return spawnSync(exe, args, {
    input,
    encoding: "utf-8",
    timeout: 6000,
    windowsHide: true,
  });
}

export function reorderQueueWithAi(input: QueueAiInput): QueueAiResult {
  const modelPath = path.join(
    process.cwd(),
    "model",
    "best_mappo_hospital.pth"
  );
  const scriptPath = path.join(
    process.cwd(),
    "xai",
    "scripts",
    "explain.py"
  );

  if (!existsSync(modelPath) || !existsSync(scriptPath)) {
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "MAPPO model/script missing. Using priority ordering.",
    };
  }

  const now = new Date();
  const wardSnapshot = {
    totalBeds: input.targetWardTotalBeds ?? 0,
    occupiedBeds: input.targetWardOccupiedBeds ?? 0,
    queue: input.targetWardQueue.map((patient) => ({
      patientId: patient.id,
      name: patient.name,
      triageLevel: priorityToTriageLevel(patient.priority),
      waitMinutes: getWaitMinutes(patient, now),
    })),
  };

  const payload = JSON.stringify({
    ...wardSnapshot,
  });

  const attempts: string[][] = [["python", scriptPath], ["py", "-3", scriptPath]];

  for (const cmd of attempts) {
    const result = runPythonCommand([...cmd, "--checkpoint", modelPath], payload);

    if (result.status === 0 && result.stdout) {
      try {
        const parsed = JSON.parse(result.stdout) as {
          ranked_queue?: Array<{ patientId?: string; name?: string }>;
          explanation_text?: string;
        };
        const order = new Map(
          (parsed.ranked_queue || []).map((patient, index) => [
            patient.patientId || patient.name || String(index),
            index,
          ])
        );
        const orderedPatients = [...input.targetWardQueue].sort((a, b) => {
          const aRank = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bRank = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return aRank - bRank;
        });

        return {
          orderedPatients,
          strategy: "ai",
          message: orderedPatients[0]
            ? `MAPPO reordered queue. Top patient: ${orderedPatients[0].name}.`
            : `MAPPO reordered queue for ${input.targetWardName}.`,
        };
      } catch {
        // Try next executable or fallback if none succeeds.
      }
    }
  }

  return {
    orderedPatients: fallbackPrioritySort(input.targetWardQueue),
    strategy: "priority",
    message: "MAPPO inference unavailable. Using priority ordering.",
  };
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