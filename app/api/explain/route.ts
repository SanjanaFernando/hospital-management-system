// app/api/explain/route.ts
//
// Explainability endpoint for the MAPPO queue-prioritization model.
//
//   GET  /api/explain?wardId=<id>              -> fast path (Layers 1,2,4,5)
//   GET  /api/explain?wardId=<id>&withShap=1    -> also includes cached
//                                                  global SHAP importance
//                                                  (Layer 3, precomputed in
//                                                  Colab, never recomputed
//                                                  live -- see the guide)
//   POST /api/explain { wardId, persist: true } -> same as GET, and also
//                                                  writes explanation_text
//                                                  into Ward.queueOrderMessage
//
// This follows the "Python subprocess per request" architecture: it shells
// out to `python xai/scripts/explain.py`, keeping the explanation logic in
// one place so the UI and the reorder path can share the same MAPPO source
// of truth.

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveForecasterProfilePath } from "@/lib/get-mappo-model";
import { resolvePythonBin } from "@/lib/resolve-python-bin";

const PYTHON_BIN = resolvePythonBin();
const CHECKPOINT_PATH =
  process.env.MAPPO_EXPLAIN_CHECKPOINT_PATH ||
  path.join(process.cwd(), "model", "best_mappo_hospital.pth");
const FORECASTER_PROFILE_PATH =
  process.env.FORECASTER_PROFILE_PATH || resolveForecasterProfilePath();
const EXPLAIN_SCRIPT_PATH = path.join(process.cwd(), "xai", "scripts", "explain.py");
const SHAP_CACHE_PATH = path.join(process.cwd(), "xai", "data", "shap_summary.json");

function toTriageInt(priority: string | number): number {
  if (typeof priority === "number") return priority;
  const match = priority.match(/\d+/);
  return match ? parseInt(match[0], 10) : 5;
}

interface WardSnapshot {
  totalBeds: number;
  occupiedBeds: number;
  usePredictive: boolean;
  forecasterProfilePath: string;
  patientHistory?: Array<{
    admissionTime?: string | Date;
    priority?: string | number;
    triageLevel?: number;
  }>;
  queue: Array<{
    patientId: string;
    name: string;
    triageLevel: number;
    waitMinutes: number;
    triageRequested?: boolean;
  }>;
}

async function buildWardSnapshot(wardId: string): Promise<WardSnapshot> {
  const { db } = await connectToDatabase();

  const ward = await db.collection("wards").findOne({ wardId });
  if (!ward) {
    throw new Error(`Ward ${wardId} not found`);
  }

  const beds = await db.collection("beds").find({ wardId }).toArray();

  const queuedPatients = await db
    .collection("patients")
    .find({ wardId, status: "queued" })
    .toArray();

  const historicalPatients = await db
    .collection("patients")
    .find({ wardId })
    .project({ admissionTime: 1, priority: 1, triageLevel: 1 })
    .toArray();

  const now = Date.now();
  const queue = queuedPatients.map((p: any) => ({
    patientId: String(p._id ?? p.id),
    name: p.name,
    triageLevel: p.triageRequested || !p.priority ? 5 : toTriageInt(p.priority),
    waitMinutes: p.admissionTime
      ? Math.max(0, (now - new Date(p.admissionTime).getTime()) / 60000)
      : Number(p.queueWaitTime ?? 0),
    triageRequested: Boolean(p.triageRequested),
  }));

  return {
    totalBeds: beds.length,
    occupiedBeds: beds.filter((bed: any) => bed.status === "occupied").length,
    usePredictive: true,
    forecasterProfilePath: FORECASTER_PROFILE_PATH,
    patientHistory: historicalPatients.map((p: any) => ({
      admissionTime: p.admissionTime,
      priority: p.priority,
      triageLevel: p.triageLevel,
    })),
    queue,
  };
}

function runExplainSubprocess(
  wardSnapshot: WardSnapshot,
  withShap: boolean
): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = [
      EXPLAIN_SCRIPT_PATH,
      "--checkpoint",
      CHECKPOINT_PATH,
      "--forecaster-profile",
      FORECASTER_PROFILE_PATH,
    ];
    if (withShap) args.push("--with-shap", "--shap-samples", "60");

    const child = spawn(PYTHON_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.error) {
          reject(new Error(`${parsed.error}\n${stderr}`));
        } else {
          resolve(parsed);
        }
      } catch (e) {
        reject(
          new Error(
            `explain.py did not return valid JSON (exit ${code}).\nstdout: ${stdout}\nstderr: ${stderr}`
          )
        );
      }
    });

    // Pipe the ward snapshot in via stdin (see explain.py: reads --ward-json
    // OR stdin). stdin avoids OS argv length limits for large queues.
    child.stdin.write(JSON.stringify(wardSnapshot));
    child.stdin.end();
  });
}

async function loadShapCache() {
  try {
    const raw = await fs.readFile(SHAP_CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null; // not generated yet -- fine, frontend should handle null gracefully
  }
}

async function handle(wardId: string | null, withShap: boolean, persist: boolean) {
  if (!wardId) {
    return NextResponse.json({ error: "wardId is required" }, { status: 400 });
  }

  if (!CHECKPOINT_PATH) {
    return NextResponse.json(
      { error: "No MAPPO checkpoint found in model/ directory." },
      { status: 500 }
    );
  }

  const wardSnapshot = await buildWardSnapshot(wardId);
  const explanation = await runExplainSubprocess(wardSnapshot, false); // Layer 3 is served from cache, not live

  if (withShap) {
    explanation.shap_global_importance_cached = await loadShapCache();
  }

  if (persist) {
    const { db } = await connectToDatabase();
    await db
      .collection("wards")
      .updateOne(
        { wardId },
        {
          $set: {
            queueOrderMessage: explanation.explanation_text,
            queueOrderStrategy: "ai",
            updatedAt: new Date(),
          },
        }
      );
  }

  return explanation;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wardId = searchParams.get("wardId");
  const withShap = searchParams.get("withShap") === "1";

  try {
    const explanation = await handle(wardId, withShap, false);
    return NextResponse.json(explanation);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const explanation = await handle(body.wardId, Boolean(body.withShap), Boolean(body.persist));
    return NextResponse.json(explanation);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}