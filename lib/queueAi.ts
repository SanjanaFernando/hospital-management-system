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
  action?: number;
}

interface QueueScriptResult {
  orderedPatientIds: string[];
  meta?: {
    action?: number;
    weights?: number[];
    wardBoost?: number;
    modelApplied?: boolean;
  };
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
  // Prefer the new 99-action model trained with the improved training code.
  // Falls back to the legacy 64-action model if the new one is not available yet.
  const newModelPath = path.join(
    process.cwd(),
    "model",
    "best_ddqn_hospital_improved.pth"
  );
  const legacyModelPath = path.join(
    process.cwd(),
    "model",
    "best_ddqn_hospital_fair.pth"
  );
  const modelPath = existsSync(newModelPath) ? newModelPath : legacyModelPath;
  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "queue_reorder_infer.py"
  );

  if (!existsSync(modelPath) || !existsSync(scriptPath)) {
    return {
      orderedPatients: fallbackPrioritySort(input.targetWardQueue),
      strategy: "priority",
      message: "AI model/script missing. Using priority ordering.",
    };
  }

  const payload = JSON.stringify({
    modelPath,
    // Disable action hysteresis so each ward can immediately switch to the
    // best-scoring action for its current queue state.
    actionSwitchMargin: 0,
    actionMaxHoldMinutes: 0,
    ...input,
  });

  const attempts = [
    ["python", scriptPath],
    ["py", "-3", scriptPath],
  ];

  for (const cmd of attempts) {
    const result = runPythonCommand(cmd, payload);

    if (result.status === 0 && result.stdout) {
      try {
        const parsed = JSON.parse(result.stdout) as QueueScriptResult;
        const order = new Map(
          parsed.orderedPatientIds.map((id, idx) => [id, idx])
        );
        const orderedPatients = [...input.targetWardQueue].sort((a, b) => {
          const aRank = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bRank = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return aRank - bRank;
        });

        return {
          orderedPatients,
          strategy: "ai",
          message: `Mixed-priority AI reordered queue (action ${parsed.meta?.action ?? "n/a"}).`,
          action: parsed.meta?.action,
        };
      } catch {
        // Try next executable or fallback if none succeeds.
      }
    }
  }

  return {
    orderedPatients: fallbackPrioritySort(input.targetWardQueue),
    strategy: "priority",
    message: "AI inference unavailable. Using priority ordering.",
  };
}