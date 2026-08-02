import { existsSync } from "node:fs";
import path from "node:path";

const MODEL_DIR = path.join(process.cwd(), "model");

const PREDICTIVE_CANDIDATES = [
  "best_mappo_shared_predictive.pth",
  "best_mappo_predictive.pth",
  "mappo_predictive.pth",
];

const BASELINE_CANDIDATES = [
  "best_mappo_hospital.pth",
  "mappo_baseline.pth",
];

export function resolveMappoModelPath(preferPredictive = true): string | null {
  const ordered = preferPredictive
    ? [...PREDICTIVE_CANDIDATES, ...BASELINE_CANDIDATES]
    : [...BASELINE_CANDIDATES, ...PREDICTIVE_CANDIDATES];

  for (const filename of ordered) {
    const candidate = path.join(MODEL_DIR, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveForecasterProfilePath(): string {
  return path.join(process.cwd(), "xai", "config", "forecaster_profile.json");
}
