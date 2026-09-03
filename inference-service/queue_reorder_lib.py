"""
Core inference library for AI-driven patient queue reordering.

Adapted from scripts/queue_reorder_infer.py into an importable module so
FastAPI can call run_inference() directly instead of spawning a subprocess.
"""
from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

import math
import numpy as np
import torch
import torch.nn as nn

from xai.forecaster import load_forecaster


# ---------------------------------------------------------------------------
# Priority / triage helpers
# ---------------------------------------------------------------------------

PRIORITY_TO_TRIAGE: dict[str, int] = {
    "Triage 1": 1,
    "Triage 2": 2,
    "Triage 3": 3,
    "Triage 4": 4,
    "Triage 5": 5,
    # Backward-compatibility aliases
    "Critical": 1,
    "Urgent": 3,
    "Non-urgent": 5,
}

# Cache for stable action selection (best-effort, non-blocking)
ACTION_CACHE_PATH = Path(__file__).resolve().parent / ".queue_action_cache.json"


# ---------------------------------------------------------------------------
# Neural network architecture (must match training exactly)
# ---------------------------------------------------------------------------

class DDQN(nn.Module):
    def __init__(
        self,
        state_dim: int = 16,
        action_dim: int = 81,
        hidden_dims: tuple[int, ...] = (128, 128),
    ):
        super().__init__()
        layers: list[nn.Module] = []
        in_dim = state_dim
        for hidden in hidden_dims:
            layers.append(nn.Linear(in_dim, hidden))
            layers.append(nn.ReLU())
            in_dim = hidden
        layers.append(nn.Linear(in_dim, action_dim))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class MAPPOActor(nn.Module):
    """Shared MAPPO actor — mirrors Actor in train.py exactly.

    Architecture: Linear→Tanh (×3 hidden) → Linear (logits)
      state_dim : 15  (gender-aware + time-aware, see FAIR_Env._state())
      n_actions : 25  (5 W_T × 5 W_W grid)
    """

    def __init__(self, state_dim: int = 15, n_actions: int = 25):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 256), nn.Tanh(),
            nn.Linear(256, 256),       nn.Tanh(),
            nn.Linear(256, 128),       nn.Tanh(),
            nn.Linear(128, n_actions),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def parse_iso(ts: str | datetime | None) -> datetime | None:
    if not ts:
        return None
    if isinstance(ts, datetime):
        return ts
    try:
        if ts.endswith("Z"):
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def priority_to_triage_level(priority: str | None) -> int:
    return PRIORITY_TO_TRIAGE.get(priority or "Triage 5", 5)


def normalized_wait_hours(patient: dict[str, Any], now: datetime) -> float:
    queue_wait = patient.get("queueWaitTime") or patient.get("waitMinutes")
    if isinstance(queue_wait, (int, float)):
        return max(0.0, float(queue_wait) / 60.0)

    arrival = parse_iso(patient.get("admissionTime"))
    if arrival is None:
        return 0.0

    if arrival.tzinfo is None:
        arrival = arrival.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    return max(0.0, (now - arrival).total_seconds() / 3600.0)


def gender_score(patient: dict[str, Any]) -> float:
    gender = str(patient.get("gender", "M")).strip().upper()
    return 1.0 if gender in {"F", "FEMALE"} else 0.0


# ---------------------------------------------------------------------------
# State builders (must match training exactly)
# ---------------------------------------------------------------------------

def build_legacy_state(payload: dict[str, Any], state_dim: int = 12) -> np.ndarray:
    queue = payload.get("targetWardQueue", [])
    total_beds = max(1, int(payload.get("targetWardTotalBeds", payload.get("totalBeds", 15))))
    occupied_beds = int(payload.get("targetWardOccupiedBeds", payload.get("occupiedBeds", 0)))

    occ = min(max(occupied_beds / total_beds, 0.0), 1.0)
    qlen = min(max(len(queue) / 20.0, 0.0), 1.0)

    triage_in_queue = np.zeros(5)
    longest_wait = 0.0

    if queue:
        for patient in queue:
            triage_index = priority_to_triage_level(patient.get("priority")) - 1
            triage_index = max(0, min(4, triage_index))
            triage_in_queue[triage_index] += 1
            wait_hours = normalized_wait_hours(patient, datetime.now(timezone.utc))
            longest_wait = max(longest_wait, wait_hours)

        triage_in_queue /= len(queue)
        longest_wait = min(longest_wait / 24.0, 1.0)

    state = np.array(
        [occ, qlen, *triage_in_queue, longest_wait, 0.0, 0.0, 0.0, 0.0],
        dtype=np.float32,
    )

    if len(state) < state_dim:
        state = np.pad(state, (0, state_dim - len(state)), "constant")

    return np.clip(state[:state_dim], 0.0, 1.0)


def build_richer_state(payload: dict[str, Any], state_dim: int = 16) -> np.ndarray:
    queue = payload.get("targetWardQueue", [])
    total_beds = max(1, int(payload.get("targetWardTotalBeds", payload.get("totalBeds", 15))))
    occupied_beds = int(payload.get("targetWardOccupiedBeds", payload.get("occupiedBeds", 0)))
    now = datetime.now(timezone.utc)

    occ = min(max(occupied_beds / total_beds, 0.0), 1.0)
    qlen = min(max(len(queue) / total_beds, 0.0), 1.0)

    t_score = w_score = a_score = g_score = 0.0
    if queue:
        patient = queue[0]
        triage_level = priority_to_triage_level(patient.get("priority"))
        t_score = (6 - triage_level) / 5.0
        w_score = min(normalized_wait_hours(patient, now) / 48.0, 1.0)
        a_score = min(float(patient.get("age", 0)) / 85.0, 1.0)
        g_score = 1.0 if gender_score(patient) > 0 else 0.5

    avg_triage = max_wait = avg_wait = avg_age = female_ratio = 0.0

    if queue:
        triage_values = [(6 - priority_to_triage_level(p.get("priority"))) / 5.0 for p in queue]
        wait_values = [min(normalized_wait_hours(p, now) / 48.0, 1.0) for p in queue]
        age_values = [min(float(p.get("age", 0)) / 85.0, 1.0) for p in queue]
        female_values = [gender_score(p) for p in queue]

        avg_triage = float(np.mean(triage_values))
        max_wait = float(np.max(wait_values))
        avg_wait = float(np.mean(wait_values))
        avg_age = float(np.mean(age_values))
        female_ratio = float(np.mean(female_values))

    features = [
        occ, qlen, t_score, w_score, a_score, g_score,
        now.hour / 23.0, avg_triage, max_wait, avg_wait, avg_age, female_ratio,
    ]

    state = np.array(features[:state_dim], dtype=np.float32)
    if len(state) < state_dim:
        state = np.pad(state, (0, state_dim - len(state)), "constant")
    return np.clip(state, 0.0, 1.0)


def build_training_state(payload: dict[str, Any], state_dim: int = 10) -> np.ndarray:
    queue = payload.get("targetWardQueue", [])
    total_beds = max(1, int(payload.get("targetWardTotalBeds", payload.get("totalBeds", 37))))
    occupied_beds = int(payload.get("targetWardOccupiedBeds", payload.get("occupiedBeds", 0)))
    now = datetime.now(timezone.utc)

    occ = occupied_beds / total_beds
    q_len = min(len(queue) / 30.0, 1.0)

    triage_dist = np.zeros(5)
    longest_wait = 0.0

    if queue:
        waits = []
        for patient in queue:
            triage_index = priority_to_triage_level(patient.get("priority")) - 1
            triage_index = max(0, min(4, triage_index))
            triage_dist[triage_index] += 1
            waits.append(normalized_wait_hours(patient, now))
        triage_dist /= len(queue)
        longest_wait = min(max(waits) / 48.0, 1.0)

    state = np.array([occ, q_len, *triage_dist, longest_wait, 0.0, 0.0], dtype=np.float32)

    if len(state) < state_dim:
        state = np.pad(state, (0, state_dim - len(state)), "constant")

    return state[:state_dim]


def build_mappo_state(payload: dict[str, Any], state_dim: int = 15) -> np.ndarray:
    """15-dim state that exactly mirrors FAIR_Env._state() from train.py.

    Dimensions (15 total):
      [0]    occ           – overall bed occupancy
      [1]    male_occ      – male-bed occupancy  (0 if ward has no male beds)
      [2]    female_occ    – female-bed occupancy (0 if ward has no female beds)
      [3]    q_len         – queue length / 40 (capped at 1)
      [4]    male_q_ratio  – fraction of queue that is Male
      [5]    female_q_ratio
      [6-10] triage_dist   – normalised triage-level histogram (T1…T5)
      [11]   longest_wait  – max queue wait / 48 h (capped at 1)
      [12]   avg_wait      – mean queue wait / 24 h (capped at 1)
      [13]   hour_sin      – sin(2π * hour / 24)
      [14]   hour_cos      – cos(2π * hour / 24)
    """
    queue         = payload.get("targetWardQueue") or payload.get("queue") or []
    total_beds    = max(1, int(payload.get("targetWardTotalBeds")  or payload.get("totalBeds",    40)))
    occupied_beds = int(payload.get("targetWardOccupiedBeds") or payload.get("occupiedBeds", 0))

    # Gender-split bed counts (caller may supply; graceful fallback)
    total_male_beds   = int(payload.get("totalMaleBeds",   total_beds))
    total_female_beds = int(payload.get("totalFemaleBeds", 0))
    occupied_male     = int(payload.get("occupiedMaleBeds",
                            occupied_beds if total_female_beds == 0 else occupied_beds // 2))
    occupied_female   = int(payload.get("occupiedFemaleBeds",
                            0 if total_female_beds == 0 else occupied_beds // 2))

    occ        = min(max(occupied_beds  / total_beds,          0.0), 1.0)
    male_occ   = (occupied_male   / total_male_beds)   if total_male_beds   > 0 else 0.0
    female_occ = (occupied_female / total_female_beds) if total_female_beds > 0 else 0.0
    q_len      = min(len(queue) / 40.0, 1.0)

    now         = datetime.now(timezone.utc)
    male_q      = 0
    female_q    = 0
    triage_dist = np.zeros(5, dtype=np.float32)
    waits: list[float] = []

    for p in queue:
        g = str(p.get("gender", "M")).strip().upper()
        if g in {"M", "MALE"}:
            male_q += 1
        else:
            female_q += 1
        t = max(0, min(4, priority_to_triage_level(p.get("priority")) - 1))
        triage_dist[t] += 1
        waits.append(normalized_wait_hours(p, now))

    if queue:
        triage_dist    /= len(queue)
        male_q_ratio    = male_q   / len(queue)
        female_q_ratio  = female_q / len(queue)
        longest_wait    = min(max(waits) / 48.0, 1.0)
        avg_wait        = min(float(np.mean(waits)) / 24.0, 1.0)
    else:
        male_q_ratio = female_q_ratio = longest_wait = avg_wait = 0.0

    hour     = now.hour + now.minute / 60.0
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)

    # 15-dim base (matches FAIR_Env._state())
    state_15 = np.array(
        [occ, male_occ, female_occ,
         q_len, male_q_ratio, female_q_ratio,
         *triage_dist,
         longest_wait, avg_wait,
         hour_sin, hour_cos],
        dtype=np.float32,
    )

    if state_dim <= 15:
        return state_15[:state_dim]

    # Extended ("predictive") model: dims 15-16 are forecaster predictions
    # run_inference injects these under _pred_load / _pred_crit before calling build_state
    pred_load = float(payload.get("_pred_load", 0.0))
    pred_crit = float(payload.get("_pred_crit", 0.0))
    state_17 = np.append(state_15, [pred_load, pred_crit]).astype(np.float32)
    return state_17[:state_dim]


def build_state(payload: dict[str, Any], state_dim: int, action_dim: int) -> np.ndarray:
    if action_dim == 25:
        return build_mappo_state(payload, state_dim=state_dim)
    if action_dim == 99:
        return build_training_state(payload, state_dim=state_dim)
    if action_dim == 64 and state_dim <= 12:
        return build_legacy_state(payload, state_dim=state_dim)
    return build_richer_state(payload, state_dim=state_dim)


# ---------------------------------------------------------------------------
# Action decoding
# ---------------------------------------------------------------------------

# MAPPO 5×5 action grid — must match W_T_LIST / W_W_LIST in train.py exactly
_MAPPO_W_T_LIST = [0.0, 0.25, 0.5, 0.75, 1.0]
_MAPPO_W_W_LIST = [0.0, 0.15, 0.3,  0.5,  0.7]

# Legacy DDQN action grids
_W_T_LIST = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]  # 11 values
_W_W_LIST = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]             # 9 values


def action_to_weights(action: int, action_dim: int) -> list[float]:
    if action_dim == 25:
        # MAPPO 5×5 grid (matches W_T_LIST / W_W_LIST in train.py)
        w_t = _MAPPO_W_T_LIST[max(0, min(action // 5, len(_MAPPO_W_T_LIST) - 1))]
        w_w = _MAPPO_W_W_LIST[max(0, min(action %  5, len(_MAPPO_W_W_LIST) - 1))]
        return [w_t, w_w]
    if action_dim == 99:
        w_triage = _W_T_LIST[action // 9]
        w_wait = _W_W_LIST[action % 9]
        return [w_triage, w_wait]
    elif action_dim == 81:
        w_triage = [0.3, 0.5, 0.7][action // 27]
        w_wait = [0.2, 0.4, 0.6][(action // 9) % 3]
        w_age = [0.1, 0.2, 0.3][(action // 3) % 3]
        w_gender = [0.0, 0.05, 0.1][action % 3]
    elif action_dim == 64:
        w_triage = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8][action // 8]
        w_wait = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7][action % 8]
        return [w_triage, w_wait]
    else:
        denom = max(1, action_dim - 1)
        r0 = action / denom
        r1 = ((action * 7) % action_dim) / denom
        r2 = ((action * 13) % action_dim) / denom
        r3 = ((action * 17) % action_dim) / denom
        w_triage = 0.3 + (0.6 * r0)
        w_wait = 0.2 + (0.6 * r1)
        w_age = 0.1 + (0.4 * r2)
        w_gender = 0.0 + (0.2 * r3)

    weights = [w_triage, w_wait, w_age, w_gender]
    total = sum(weights)
    return [w / total for w in weights]


# ---------------------------------------------------------------------------
# Patient scoring
# ---------------------------------------------------------------------------

def patient_score(
    patient: dict[str, Any],
    now: datetime,
    weights: list[float],
    action_dim: int = 81,
) -> float:
    triage_level = priority_to_triage_level(patient.get("priority"))
    wait_hours = normalized_wait_hours(patient, now)

    if action_dim == 25:
        # MAPPO: exact scoring from FAIR_Env.step() in train.py
        w_t, w_w = weights
        return w_t * (6 - triage_level) + w_w * wait_hours

    if action_dim == 99:
        w_t, w_w = weights
        return w_t * (6 - triage_level) + w_w * wait_hours

    if len(weights) == 2:
        w_triage, w_wait = weights
        triage_score = (6 - triage_level) / 5.0
        wait_score = min(wait_hours / 24.0, 1.0)
        return (w_triage * triage_score) + (w_wait * wait_score)

    w_triage, w_wait, w_age, w_gender = weights
    triage_score = (6 - triage_level) / 5.0
    wait_score = min(wait_hours / 48.0, 1.0)
    age_score = min(float(patient.get("age", 0)) / 85.0, 1.0)
    female_score = gender_score(patient)

    return (
        (w_triage * triage_score)
        + (w_wait * wait_score)
        + (w_age * age_score)
        + (w_gender * female_score)
    )


# ---------------------------------------------------------------------------
# Stable action selection with cache
# ---------------------------------------------------------------------------

def load_action_cache() -> dict[str, dict[str, Any]]:
    if not ACTION_CACHE_PATH.exists():
        return {}
    try:
        with ACTION_CACHE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_action_cache(cache: dict[str, dict[str, Any]]) -> None:
    try:
        ACTION_CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")
    except OSError:
        pass  # Cache is best-effort


def choose_stable_action(
    ward_id: str | None,
    q_values: np.ndarray,
    suggested_action: int,
    disallowed_actions: set[int],
    payload: dict[str, Any],
) -> tuple[int, dict[str, Any]]:
    if not ward_id:
        return suggested_action, {"reason": "no-ward"}

    margin = float(payload.get("actionSwitchMargin", 3.0))
    max_hold_minutes = float(payload.get("actionMaxHoldMinutes", 45))

    cache = load_action_cache()
    entry = cache.get(ward_id)

    selected_action = suggested_action
    reason = "fresh"
    prev_action = None
    q_gap = None

    if isinstance(entry, dict):
        prev_action_raw = entry.get("action")
        prev_ts_raw = entry.get("updatedAt")

        if isinstance(prev_action_raw, int) and 0 <= prev_action_raw < len(q_values):
            prev_action = None if prev_action_raw in disallowed_actions else prev_action_raw

        if prev_action is not None:
            prev_q = float(q_values[prev_action])
            best_q = float(q_values[suggested_action])
            q_gap = best_q - prev_q

            age_minutes = None
            if isinstance(prev_ts_raw, str):
                prev_ts = parse_iso(prev_ts_raw)
                if prev_ts is not None:
                    now = datetime.now(timezone.utc)
                    if prev_ts.tzinfo is None:
                        prev_ts = prev_ts.replace(tzinfo=timezone.utc)
                    age_minutes = max(0.0, (now - prev_ts).total_seconds() / 60.0)

            hold_expired = age_minutes is not None and age_minutes >= max_hold_minutes
            wants_switch = suggested_action != prev_action

            if wants_switch:
                if q_gap >= margin:
                    selected_action = suggested_action
                    reason = "switch-margin"
                elif hold_expired and q_gap >= 0:
                    selected_action = suggested_action
                    reason = "switch-expired"
                else:
                    selected_action = prev_action
                    reason = "hold"
            else:
                selected_action = suggested_action
                reason = "same"

    if selected_action in disallowed_actions:
        selection_q = q_values.copy()
        for blocked in disallowed_actions:
            if 0 <= blocked < len(selection_q):
                selection_q[blocked] = -np.inf
        selected_action = int(np.argmax(selection_q))
        reason = "forced-allowed"

    cache[ward_id] = {
        "action": int(selected_action),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    save_action_cache(cache)

    return selected_action, {
        "reason": reason,
        "previousAction": prev_action,
        "suggestedAction": suggested_action,
        "selectedAction": selected_action,
        "switchMargin": margin,
        "qGapVsPrevious": q_gap,
    }


# ---------------------------------------------------------------------------
# Checkpoint utilities
# ---------------------------------------------------------------------------

def extract_state_dict(checkpoint: Any) -> dict[str, torch.Tensor]:
    if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
        candidate = checkpoint["state_dict"]
    else:
        candidate = checkpoint
    if not isinstance(candidate, dict):
        raise ValueError("Checkpoint is not a state_dict-like object")
    return candidate


def infer_model_layout(state_dict: dict[str, torch.Tensor]) -> tuple[int, tuple[int, ...], int]:
    linear_weights = sorted(
        (k, v) for k, v in state_dict.items()
        if k.startswith("net.") and k.endswith(".weight")
    )
    if len(linear_weights) < 2:
        raise ValueError("Unsupported checkpoint layout: expected at least two net weight layers")
    return (
        int(linear_weights[0][1].shape[1]),
        tuple(int(v.shape[0]) for _, v in linear_weights[:-1]),
        int(linear_weights[-1][1].shape[0]),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_model(model_path: str) -> tuple[nn.Module, dict[str, Any]]:
    """Load a MAPPO or DDQN checkpoint and return (model, layout_metadata).

    Auto-detection rule:
      action_dim == 25  →  MAPPOActor  (shared actor, any state_dim)
      Otherwise         →  DDQN        (legacy, backward-compat)
    """
    checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
    state_dict = extract_state_dict(checkpoint)
    state_dim, hidden_dims, action_dim = infer_model_layout(state_dict)

    if action_dim == 25:
        model: nn.Module = MAPPOActor(state_dim=state_dim, n_actions=action_dim)
        model_type = "mappo"
    else:
        model = DDQN(state_dim=state_dim, action_dim=action_dim, hidden_dims=hidden_dims)
        model_type = "ddqn"

    model.load_state_dict(state_dict)
    model.eval()
    return model, {
        "state_dim": state_dim,
        "hidden_dims": hidden_dims,
        "action_dim": action_dim,
        "model_type": model_type,
    }


def run_inference(
    payload: dict[str, Any],
    model: nn.Module,
    model_meta: dict[str, Any],
) -> dict[str, Any]:
    """
    Run AI queue reordering inference.

    Accepts both "queue" and "targetWardQueue" keys (handles the key used by
    the Next.js TypeScript client). Returns a dict with orderedPatientIds and
    predictive_analytics.
    """
    state_dim: int = model_meta["state_dim"]
    action_dim: int = model_meta["action_dim"]

    # Accept both key names from the TypeScript client
    queue: list[dict] = payload.get("targetWardQueue") or payload.get("queue") or []

    normalized: dict[str, Any] = {
        **payload,
        "targetWardQueue": queue,
        "targetWardTotalBeds": (
            payload.get("targetWardTotalBeds")
            or payload.get("totalBeds")
            or 15
        ),
        "targetWardOccupiedBeds": (
            payload.get("targetWardOccupiedBeds")
            or payload.get("occupiedBeds")
            or 0
        ),
    }

    # Forecaster uses patientHistory when available, else bundled profile
    forecaster = load_forecaster(normalized, profile_path=None)
    now = datetime.now(timezone.utc)
    forecast = forecaster.predict_details(now)

    expected_arrivals = float(forecast.get("expected_arrivals", 0.0))
    predicted_critical_share = float(forecast.get("pred_crit", 0.0))

    predictive_analytics: dict[str, Any] = {
        "enabled": True,
        "pred_load": round(float(forecast.get("pred_load", 0.0)), 4),
        "pred_crit": round(predicted_critical_share, 4),
        "expected_arrivals": round(expected_arrivals, 2),
        "expected_critical_patients": round(expected_arrivals * predicted_critical_share, 2),
        "horizon_hours": int(forecast.get("horizon_hours", 6)),
        "surge_predicted": forecaster.is_surge(now),
    }

    # Inject forecaster predictions so build_mappo_state can include them
    # in the 17-dim predictive state (dims 15-16 = pred_load, pred_crit)
    normalized["_pred_load"] = float(forecast.get("pred_load", 0.0))
    normalized["_pred_crit"] = round(predicted_critical_share, 6)

    state = build_state(normalized, state_dim=state_dim, action_dim=action_dim)

    with torch.no_grad():
        q_values = model(torch.FloatTensor(state).unsqueeze(0)).squeeze(0).numpy()

    disallowed_actions: set[int] = set()
    # Block action 0 for MAPPO (w_t=0, w_w=0 — no-op ordering) and legacy DDQN grids
    if action_dim in (25, 64, 99):
        disallowed_actions.add(0)

    selection_q = q_values.copy()
    for blocked in disallowed_actions:
        if 0 <= blocked < len(selection_q):
            selection_q[blocked] = -np.inf

    suggested_action = int(np.argmax(selection_q))
    action, stability_meta = choose_stable_action(
        ward_id=normalized.get("targetWardId"),
        q_values=q_values,
        suggested_action=suggested_action,
        disallowed_actions=disallowed_actions,
        payload=normalized,
    )
    weights = action_to_weights(action, action_dim=action_dim)

    now2 = datetime.now(timezone.utc)
    sorted_queue = sorted(
        queue,
        key=lambda p: patient_score(p, now2, weights, action_dim),
        reverse=True,
    )

    ordered_ids = [
        p.get("id") or p.get("patientId")
        for p in sorted_queue
        if p.get("id") or p.get("patientId")
    ]

    return {
        "orderedPatientIds": ordered_ids,
        "meta": {
            "action": action,
            "suggestedAction": suggested_action,
            "actionDim": action_dim,
            "stateDim": state_dim,
            "hiddenDims": list(model_meta["hidden_dims"]),
            "weights": weights,
            "actionStability": stability_meta,
            "modelApplied": True,
        },
        "predictive_analytics": predictive_analytics,
    }
