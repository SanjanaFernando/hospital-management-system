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
import { getSessionFromHeaders, canReorderQueue } from "@/lib/rbac";

const PYTHON_BIN = resolvePythonBin();
const CHECKPOINT_PATH =
  process.env.MAPPO_EXPLAIN_CHECKPOINT_PATH ||
  path.join(process.cwd(), "model", "best_mappo_shared.pth");
const FORECASTER_PROFILE_PATH =
  process.env.FORECASTER_PROFILE_PATH || resolveForecasterProfilePath();
const EXPLAIN_SCRIPT_PATH = path.join(
  process.cwd(),
  "xai",
  "scripts",
  "explain.py"
);
const SHAP_CACHE_PATH = path.join(
  process.cwd(),
  "xai",
  "data",
  "shap_summary.json"
);

// When running on Vercel (or any hosted env), the inference service URL is set.
// In that case we delegate explain calls via HTTP to the FastAPI /explain endpoint
// instead of spawning a local Python subprocess (which Vercel does not support).
const USE_LOCAL_XAI =
  process.env.NODE_ENV === "development" ||
  process.env.XAI_USE_LOCAL === "true";
const INFERENCE_SERVICE_URL = USE_LOCAL_XAI
  ? ""
  : (process.env.QUEUE_AI_ENDPOINT?.replace(/\/$/, "") ?? "");

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

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(PYTHON_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (spawnErr: any) {
      // Python not found on this machine / serverless environment
      return reject(
        new Error(
          `Python executable not found (${PYTHON_BIN}). ` +
            "Set INFERENCE_SERVICE_URL to your Render service URL so the hosted " +
            "environment delegates XAI to the inference service instead of a local subprocess."
        )
      );
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        // Python executable does not exist — common on Vercel / serverless
        reject(
          new Error(
            `Python executable not found (${PYTHON_BIN}). ` +
              "Set INFERENCE_SERVICE_URL to your Render service URL so the hosted " +
              "environment delegates XAI to the inference service instead of a local subprocess."
          )
        );
      } else {
        reject(err);
      }
    });
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
    child.stdin?.write(JSON.stringify(wardSnapshot));
    child.stdin?.end();
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

/**
 * Call the hosted FastAPI /explain endpoint when INFERENCE_SERVICE_URL is set.
 * This is the production path (Vercel cannot spawn local Python subprocesses).
 */
async function runExplainViaHttp(wardSnapshot: WardSnapshot): Promise<any> {
  const url = `${INFERENCE_SERVICE_URL}/explain`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wardSnapshot),
    // Give the MAPPO checkpoint load time on cold starts (Render free tier).
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = JSON.stringify(body.detail ?? body);
    } catch {
      detail = await response.text();
    }
    throw new Error(
      `Inference service /explain returned ${response.status}: ${detail}`
    );
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

async function handle(
  wardId: string | null,
  withShap: boolean,
  persist: boolean
) {
  if (!wardId) {
    return NextResponse.json({ error: "wardId is required" }, { status: 400 });
  }

  if (!CHECKPOINT_PATH && !INFERENCE_SERVICE_URL) {
    return NextResponse.json(
      { error: "No MAPPO checkpoint found in model/ directory." },
      { status: 500 }
    );
  }

  const wardSnapshot = await buildWardSnapshot(wardId);

  // Production path: delegate to hosted inference service via HTTP.
  // Localhost path: spawn local Python subprocess (unchanged behaviour).
  const explanation = INFERENCE_SERVICE_URL
    ? await runExplainViaHttp(wardSnapshot)
    : await runExplainSubprocess(wardSnapshot, false); // Layer 3 is served from cache, not live

  if (withShap) {
    explanation.shap_global_importance_cached = await loadShapCache();
  }

  if (persist) {
    const { db } = await connectToDatabase();
    await db.collection("wards").updateOne(
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
  const session = getSessionFromHeaders(request.headers);
  if (!session || session.role === "guest") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const wardId = searchParams.get("wardId");
  const withShap = searchParams.get("withShap") === "1";

  if (!wardId) {
    return NextResponse.json({ error: "wardId is required" }, { status: 400 });
  }

  if (!canReorderQueue(session, wardId)) {
    return NextResponse.json(
      {
        error:
          "Forbidden: You do not have reorder_queue permission for this ward",
      },
      { status: 403 }
    );
  }

  try {
    const explanation = await handle(wardId, withShap, false);
    return NextResponse.json(explanation);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = getSessionFromHeaders(request.headers);
  if (!session || session.role === "guest") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body?.wardId) {
      return NextResponse.json(
        { error: "wardId is required" },
        { status: 400 }
      );
    }

    if (!canReorderQueue(session, body.wardId)) {
      return NextResponse.json(
        {
          error:
            "Forbidden: You do not have reorder_queue permission for this ward",
        },
        { status: 403 }
      );
    }

    const explanation = await handle(
      body.wardId,
      Boolean(body.withShap),
      Boolean(body.persist)
    );
    return NextResponse.json(explanation);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
