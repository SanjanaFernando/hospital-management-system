#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

import numpy as np
import torch
import torch.nn as nn


PRIORITY_TO_TRIAGE = {
    "Triage 1": 1,
    "Triage 2": 2,
    "Triage 3": 3,
    "Triage 4": 4,
    "Triage 5": 5,
    # Backward compatibility for legacy records.
    "Critical": 1,
    "Urgent": 3,
    "Non-urgent": 5,
}


ACTION_CACHE_PATH = Path(__file__).resolve().parents[1] / ".queue_action_cache.json"


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


def parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def priority_to_triage_level(priority: str | None) -> int:
    return PRIORITY_TO_TRIAGE.get(priority or "Triage 5", 5)


def normalized_wait_hours(patient: dict[str, Any], now: datetime) -> float:
    queue_wait = patient.get("queueWaitTime")
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


def build_legacy_state(payload: dict[str, Any], state_dim: int = 12) -> np.ndarray:
    queue = payload.get("targetWardQueue", [])
    total_beds = max(
        1,
        int(
            payload.get(
                "targetWardTotalBeds",
                payload.get("totalBeds", 15),
            )
        ),
    )
    occupied_beds = int(
        payload.get("targetWardOccupiedBeds", payload.get("occupiedBeds", 0))
    )

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
        [
            occ,
            qlen,
            *triage_in_queue,
            longest_wait,
            0.0,
            0.0,
            0.0,
            0.0,
        ],
        dtype=np.float32,
    )

    if len(state) < state_dim:
        state = np.pad(state, (0, state_dim - len(state)), "constant")

    return np.clip(state[:state_dim], 0.0, 1.0)


def build_richer_state(payload: dict[str, Any], state_dim: int = 16) -> np.ndarray:
    queue = payload.get("targetWardQueue", [])
    total_beds = max(
        1,
        int(
            payload.get(
                "targetWardTotalBeds",
                payload.get("totalBeds", 15),
            )
        ),
    )
    occupied_beds = int(
        payload.get("targetWardOccupiedBeds", payload.get("occupiedBeds", 0))
    )
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

    avg_triage = 0.0
    max_wait = 0.0
    avg_wait = 0.0
    avg_age = 0.0
    female_ratio = 0.0

    if queue:
        triage_values = [
            (6 - priority_to_triage_level(p.get("priority"))) / 5.0 for p in queue
        ]
        wait_values = [min(normalized_wait_hours(p, now) / 48.0, 1.0) for p in queue]
        age_values = [min(float(p.get("age", 0)) / 85.0, 1.0) for p in queue]
        female_values = [gender_score(p) for p in queue]

        avg_triage = float(np.mean(triage_values))
        max_wait = float(np.max(wait_values))
        avg_wait = float(np.mean(wait_values))
        avg_age = float(np.mean(age_values))
        female_ratio = float(np.mean(female_values))

    features = [
        occ,
        qlen,
        t_score,
        w_score,
        a_score,
        g_score,
        now.hour / 23.0,
        avg_triage,
        max_wait,
        avg_wait,
        avg_age,
        female_ratio,
    ]

    state = np.array(features[:state_dim], dtype=np.float32)
    if len(state) < state_dim:
        state = np.pad(state, (0, state_dim - len(state)), "constant")
    return np.clip(state, 0.0, 1.0)


def build_training_state(payload: dict[str, Any], state_dim: int = 10) -> np.ndarray:
    """Build state vector matching the training _state() method exactly.

    10 features: [occ, q_len, triage_dist(5), longest_wait, 0.0, 0.0]
    - occ = occupied_beds / total_beds
    - q_len = min(len(queue) / 30.0, 1.0)
    - triage_dist = normalized count per triage level
    - longest_wait = min(max_wait_hours / 48.0, 1.0)
    """
    queue = payload.get("targetWardQueue", [])
    total_beds = max(
        1,
        int(
            payload.get(
                "targetWardTotalBeds",
                payload.get("totalBeds", 37),
            )
        ),
    )
    occupied_beds = int(
        payload.get("targetWardOccupiedBeds", payload.get("occupiedBeds", 0))
    )
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
            wait_hours = normalized_wait_hours(patient, now)
            waits.append(wait_hours)
        triage_dist /= len(queue)
        longest_wait = min(max(waits) / 48.0, 1.0)

    state = np.array(
        [occ, q_len, *triage_dist, longest_wait, 0.0, 0.0],
        dtype=np.float32,
    )

    if len(state) < state_dim:
        state = np.pad(state, (0, state_dim - len(state)), "constant")

    return state[:state_dim]


def build_state(payload: dict[str, Any], state_dim: int, action_dim: int) -> np.ndarray:
    if action_dim == 99:
        return build_training_state(payload, state_dim=state_dim)

    if action_dim == 64 and state_dim <= 12:
        return build_legacy_state(payload, state_dim=state_dim)

    return build_richer_state(payload, state_dim=state_dim)


# Action decoding tables matching the training code exactly.
_W_T_LIST = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]  # 11 values
_W_W_LIST = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]             # 9 values


def action_to_weights(action: int, action_dim: int) -> list[float]:
    if action_dim == 99:
        # Training code: 11 triage weights × 9 wait weights = 99 actions.
        # w_t = w_t_list[action // len(w_w_list)]  →  action // 9
        # w_w = w_w_list[action % len(w_w_list)]   →  action % 9
        w_triage = _W_T_LIST[action // 9]
        w_wait = _W_W_LIST[action % 9]
        return [w_triage, w_wait]
    elif action_dim == 81:
        w_triage = [0.3, 0.5, 0.7][action // 27]
        w_wait = [0.2, 0.4, 0.6][(action // 9) % 3]
        w_age = [0.1, 0.2, 0.3][(action // 3) % 3]
        w_gender = [0.0, 0.05, 0.1][action % 3]
    elif action_dim == 64:
        # Legacy model family: 8x8 weighting over triage and wait only.
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
    return [weight / total for weight in weights]


def extract_state_dict(checkpoint: Any) -> dict[str, torch.Tensor]:
    if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
        candidate = checkpoint["state_dict"]
    else:
        candidate = checkpoint

    if not isinstance(candidate, dict):
        raise ValueError("Checkpoint is not a state_dict-like object")

    return candidate


def infer_model_layout(state_dict: dict[str, torch.Tensor]) -> tuple[int, tuple[int, ...], int]:
    if "net.0.weight" not in state_dict or "net.2.weight" not in state_dict:
        raise ValueError("Unsupported checkpoint layout: missing net.0/net.2 weights")

    in_dim = int(state_dict["net.0.weight"].shape[1])
    first_hidden = int(state_dict["net.0.weight"].shape[0])

    if "net.4.weight" in state_dict:
        second_hidden = int(state_dict["net.2.weight"].shape[0])
        out_dim = int(state_dict["net.4.weight"].shape[0])
        hidden = (first_hidden, second_hidden)
    else:
        out_dim = int(state_dict["net.2.weight"].shape[0])
        hidden = (first_hidden,)

    return in_dim, hidden, out_dim


def patient_score(
    patient: dict[str, Any],
    now: datetime,
    weights: list[float],
    action_dim: int = 81,
) -> float:
    triage_level = priority_to_triage_level(patient.get("priority"))
    wait_hours = normalized_wait_hours(patient, now)

    if action_dim == 99:
        # Match training scoring exactly: raw values, NO normalization.
        # Training: score = w_t * (6 - triage_level) + w_w * wait_hours
        w_t, w_w = weights
        return w_t * (6 - triage_level) + w_w * wait_hours

    if len(weights) == 2:
        w_triage, w_wait = weights
        # Keep legacy (64-action) ranking consistent with legacy state features.
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


def load_action_cache() -> dict[str, dict[str, Any]]:
    if not ACTION_CACHE_PATH.exists():
        return {}

    try:
        with ACTION_CACHE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}

    if isinstance(data, dict):
        return data

    return {}


def save_action_cache(cache: dict[str, dict[str, Any]]) -> None:
    try:
        ACTION_CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")
    except OSError:
        # Cache persistence is best-effort and should not break inference.
        return


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
            if prev_action_raw in disallowed_actions:
                prev_action = None
            else:
                prev_action = prev_action_raw

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

            # Hysteresis: keep current action unless the new winner is clearly better,
            # or the hold window has expired and it is at least not worse.
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
        # Fallback safety: choose best allowed action when a disallowed action slips through.
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

    meta = {
        "reason": reason,
        "previousAction": prev_action,
        "suggestedAction": suggested_action,
        "selectedAction": selected_action,
        "switchMargin": margin,
        "qGapVsPrevious": q_gap,
    }
    return selected_action, meta


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "No input payload provided"}))
        return 1

    payload = json.loads(raw)
    model_path = payload.get("modelPath")

    checkpoint = torch.load(model_path, map_location="cpu")
    state_dict = extract_state_dict(checkpoint)
    state_dim, hidden_dims, action_dim = infer_model_layout(state_dict)

    state = build_state(payload, state_dim=state_dim, action_dim=action_dim)

    model = DDQN(state_dim=state_dim, action_dim=action_dim, hidden_dims=hidden_dims)
    model.load_state_dict(state_dict)
    model.eval()

    with torch.no_grad():
        q_values = model(torch.FloatTensor(state).unsqueeze(0)).squeeze(0).numpy()

    disallowed_actions: set[int] = set()
    if action_dim in (64, 99):
        # Action 0 gives w_t=0, w_w=0 → score=0 for all patients (no differentiation).
        disallowed_actions.add(0)

    selection_q_values = q_values.copy()
    for blocked in disallowed_actions:
        if 0 <= blocked < len(selection_q_values):
            selection_q_values[blocked] = -np.inf

    suggested_action = int(np.argmax(selection_q_values))
    action, stability_meta = choose_stable_action(
        ward_id=payload.get("targetWardId"),
        q_values=q_values,
        suggested_action=suggested_action,
        disallowed_actions=disallowed_actions,
        payload=payload,
    )
    weights = action_to_weights(action, action_dim=action_dim)

    now = datetime.now(timezone.utc)
    queue = payload.get("targetWardQueue", [])

    sorted_queue = sorted(
        queue,
        key=lambda p: patient_score(p, now, weights, action_dim),
        reverse=True,
    )

    print(
        json.dumps(
            {
                "orderedPatientIds": [p.get("id") for p in sorted_queue if p.get("id")],
                "meta": {
                    "action": action,
                    "suggestedAction": suggested_action,
                    "actionDim": action_dim,
                    "stateDim": state_dim,
                    "hiddenDims": list(hidden_dims),
                    "weights": weights,
                    "qValues": [float(x) for x in q_values],
                    "actionStability": stability_meta,
                    "modelApplied": True,
                },
            }
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
