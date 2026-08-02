"""
FastAPI service for AI-driven patient queue reordering.
Deployed on Render. Called by the Next.js app via HTTP instead of a local subprocess.

Endpoints:
  GET  /health   — liveness probe
  POST /reorder  — run DDQN inference and return ordered patient IDs
"""
from __future__ import annotations

import os
import logging
from contextlib import asynccontextmanager
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
    "./model/best_mappo_shared_predictive.pth",
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
    logger.info("Loading model from %s …", MODEL_PATH)
    try:
        model, meta = load_model(MODEL_PATH)
        _model_state["model"] = model
        _model_state["meta"] = meta
        logger.info(
            "Model ready — state_dim=%d  action_dim=%d  hidden=%s",
            meta["state_dim"],
            meta["action_dim"],
            meta["hidden_dims"],
        )
    except Exception as exc:
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
    description="DDQN-based patient queue reordering service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Vercel deployment + local dev
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, Any]:
    """Liveness / readiness probe."""
    model_loaded = "model" in _model_state
    return {
        "status": "ok" if model_loaded else "degraded",
        "model_loaded": model_loaded,
        "model_path": MODEL_PATH,
    }


@app.post("/reorder")
async def reorder(request: Request) -> JSONResponse:
    """
    Run DDQN inference and return a ranked patient list.

    Request body (JSON):
      - targetWardId        string
      - targetWardQueue     Patient[]  (or "queue" — both keys accepted)
      - targetWardTotalBeds number
      - targetWardOccupiedBeds number
      - patientHistory      PatientHistoryEntry[]  (optional)

    Response (JSON):
      - orderedPatientIds   string[]
      - predictive_analytics  { enabled, pred_load, pred_crit, … }
      - meta                { action, weights, … }
    """
    if "model" not in _model_state:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Check server logs for startup errors.",
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
