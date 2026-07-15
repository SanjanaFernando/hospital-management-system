import { existsSync } from "node:fs";
import path from "node:path";

const VENV_PYTHON = path.join(process.cwd(), ".venv", "Scripts", "python.exe");

/** Same resolution order as app/api/explain/route.ts */
export function resolvePythonBin(): string {
  return process.env.PYTHON_BIN || (existsSync(VENV_PYTHON) ? VENV_PYTHON : "python");
}

/** Ordered Python executables to try when spawning explain.py */
export function pythonCommandCandidates(): string[][] {
  const primary = resolvePythonBin();
  const candidates: string[][] = [[primary]];

  if (primary !== "python") {
    candidates.push(["python"]);
  }

  candidates.push(["py", "-3"]);
  return candidates;
}
