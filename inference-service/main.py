"""
FastAPI service for AI-driven patient queue reordering.
Deployed on Render. Called by the Next.js app via HTTP instead of a local subprocess.

Endpoints:
  GET  /health   — liveness / readiness probe
  GET  /debug    — detailed diagnostics (file existence, model layout, env vars)
  POST /reorder  — run MAPPO inference and return ordered patient IDs
"""
from __future__ import annotations

import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from queue_reorder_lib import load_model, run_inference

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODEL_PATH = os.environ.get(
    "MODEL_PATH",
    "./model/best_mappo_hospital.pth",
)

# Separate checkpoint used by the /explain endpoint (MAPPO 5-actor checkpoint).
# Set MAPPO_EXPLAIN_CHECKPOINT_PATH in Render env vars to point at the file
# uploaded to your persistent disk / object store.  Falls back to the same
# model directory as MODEL_PATH.
EXPLAIN_CHECKPOINT_PATH = os.environ.get(
    "MAPPO_EXPLAIN_CHECKPOINT_PATH",
    str(Path(MODEL_PATH).parent / "best_mappo_hospital.pth"),
)

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger("inference-service")

# ---------------------------------------------------------------------------
# Model state (loaded once at startup)
# ---------------------------------------------------------------------------

_model_state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model on startup; release resources on shutdown."""
    model_path = Path(MODEL_PATH)
    logger.info("Loading model from %s …", MODEL_PATH)
    logger.info("Model file exists: %s", model_path.exists())

    if model_path.exists():
        logger.info("Model file size: %.1f KB", model_path.stat().st_size / 1024)

    try:
        model, meta = load_model(MODEL_PATH)
        _model_state["model"] = model
        _model_state["meta"] = meta
        _model_state["load_error"] = None
        logger.info(
            "Model ready — state_dim=%d  action_dim=%d  hidden=%s",
            meta["state_dim"],
            meta["action_dim"],
            meta["hidden_dims"],
        )
    except Exception as exc:
        _model_state["load_error"] = str(exc)
        logger.error("Failed to load model: %s", exc)
        # Service starts but /reorder will return 503
 

    yield

    _model_state.clear()
    logger.info("Model unloaded.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Hospital AI Queue Inference",
    description="MAPPO shared-actor patient queue reordering service",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, Any]:
    """Liveness / readiness probe — quick model status check."""
    model_path = Path(MODEL_PATH)
    model_loaded = "model" in _model_state

    return {
        "status": "ok" if model_loaded else "degraded",
        "model_loaded": model_loaded,
        "model_file_exists": model_path.exists(),
        "model_file_size_kb": round(model_path.stat().st_size / 1024, 1) if model_path.exists() else None,
        "model_path": MODEL_PATH,
        "load_error": _model_state.get("load_error"),
    }


@app.get("/debug")
def debug() -> dict[str, Any]:
    """Detailed diagnostics — model layout, environment, working directory."""
    model_path = Path(MODEL_PATH)
    meta = _model_state.get("meta", {})

    # List everything in the model directory
    model_dir = model_path.parent
    model_dir_contents = []
    if model_dir.exists():
        model_dir_contents = [
            {"name": f.name, "size_kb": round(f.stat().st_size / 1024, 1)}
            for f in sorted(model_dir.iterdir())
        ]

    return {
        "cwd": os.getcwd(),
        "model_path_configured": MODEL_PATH,
        "model_file_exists": model_path.exists(),
        "model_file_size_kb": round(model_path.stat().st_size / 1024, 1) if model_path.exists() else None,
        "model_dir_contents": model_dir_contents,
        "model_loaded": "model" in _model_state,
        "load_error": _model_state.get("load_error"),
        "model_layout": {
            "state_dim": meta.get("state_dim"),
            "action_dim": meta.get("action_dim"),
            "hidden_dims": list(meta.get("hidden_dims", [])),
            "model_type": meta.get("model_type", "unknown"),
        } if meta else None,
        "env": {
            "MODEL_PATH": os.environ.get("MODEL_PATH"),
            "LOG_LEVEL": os.environ.get("LOG_LEVEL"),
            "PORT": os.environ.get("PORT"),
        },
    }


@app.post("/reorder")
async def reorder(request: Request) -> JSONResponse:
    """
    Run MAPPO shared-actor inference and return a ranked patient list.

    Request body (JSON):
      - targetWardId          string
      - targetWardQueue        Patient[]  (or "queue" — both keys accepted)
      - targetWardTotalBeds    number
      - targetWardOccupiedBeds number
      - totalMaleBeds          number  (optional — improves gender-aware state)
      - totalFemaleBeds        number  (optional)
      - patientHistory         PatientHistoryEntry[]  (optional)

    Response (JSON):
      - orderedPatientIds   string[]
      - predictive_analytics  { enabled, pred_load, pred_crit, … }
      - meta                { action, weights, model_type, … }
    """
    if "model" not in _model_state:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Model not loaded.",
                "load_error": _model_state.get("load_error"),
                "hint": "Check /debug for file existence and directory listing.",
            },
        )

    try:
        payload: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    try:
        result = run_inference(payload, _model_state["model"], _model_state["meta"])
        logger.info(
            "Inference OK — ward=%s  queue_len=%d  ordered=%d",
            payload.get("targetWardId", "?"),
            len(payload.get("targetWardQueue") or payload.get("queue") or []),
            len(result.get("orderedPatientIds", [])),
        )
        return JSONResponse(content=result)
    except Exception as exc:
        logger.exception("Inference error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/explain")
async def explain(request: Request) -> JSONResponse:
    """
    Run MAPPO explainability and return XAI results for the ward queue.

    This endpoint is the hosted equivalent of the `python xai/scripts/explain.py`
    subprocess the Next.js app calls locally.  The Next.js API route at
    /api/explain will call this endpoint instead of spawning a subprocess when
    the INFERENCE_SERVICE_URL environment variable is set (i.e. in production).

    Request body (JSON) — same ward-snapshot shape as the local explain script:
      - totalBeds          number
      - occupiedBeds       number
      - queue              Array of { patientId, name, triageLevel, waitMinutes, ... }
      - usePredictive      boolean (optional, default true)
      - patientHistory     Array of historical patient records (optional)
      - forecasterProfilePath  string path (optional)

    Response (JSON):
      - state_vector           { feature_name: float, ... }  (10 features)
      - predictive_analytics   { enabled, pred_load, pred_crit, ... }
      - combined_weights        { w_t_urgency, w_w_wait }
      - agent_votes            Array of per-agent negotiation details
      - agent_confidence       Array of per-agent entropy/confidence
      - ranked_queue           Array of patients with priorityScore, rank, reason, ...
      - explanation_text       Natural-language summary (Layer 5)
    """
    explain_path = Path(EXPLAIN_CHECKPOINT_PATH)
    if not explain_path.exists():
        raise HTTPException(
            status_code=503,
            detail={
                "error": "MAPPO explain checkpoint not found.",
                "path": str(explain_path),
                "hint": (
                    "Upload best_mappo_hospital.pth to the model/ directory and set "
                    "MAPPO_EXPLAIN_CHECKPOINT_PATH in your Render environment variables."
                ),
            },
        )

    try:
        ward_snapshot: dict = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    try:
        from xai.explain_engine import explain_decision

        result = explain_decision(
            ward_snapshot,
            checkpoint_path=str(explain_path),
            device="cpu",
            with_shap=bool(ward_snapshot.get("withShap", False)),
        )
        logger.info(
            "Explain OK — queue_len=%d  top_patient=%s",
            len(ward_snapshot.get("queue", [])),
            result.get("ranked_queue", [{}])[0].get("name", "?") if result.get("ranked_queue") else "empty",
        )
        return JSONResponse(content=result)
    # except Exception as exc:
    #     logger.exception("Explain error: %s", exc)
    #     raise HTTPException(status_code=500, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
         logger.exception("Explain error: %s", exc)
         raise HTTPException(status_code=500, detail=str(exc))
