#!/usr/bin/env python3
import json
import sys
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


def build_state(payload: dict[str, Any], state_dim: int = 16) -> np.ndarray:
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


def action_to_weights(action: int, action_dim: int) -> list[float]:
    if action_dim == 81:
        w_triage = [0.3, 0.5, 0.7][action // 27]
        w_wait = [0.2, 0.4, 0.6][(action // 9) % 3]
        w_age = [0.1, 0.2, 0.3][(action // 3) % 3]
        w_gender = [0.0, 0.05, 0.1][action % 3]
    elif action_dim == 64:
        # Legacy model family: 4-level weighting over triage/wait/age.
        w_triage = [0.25, 0.45, 0.65, 0.85][action // 16]
        w_wait = [0.2, 0.4, 0.6, 0.8][(action // 4) % 4]
        w_age = [0.1, 0.2, 0.3, 0.4][action % 4]
        w_gender = 0.0
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


def patient_score(patient: dict[str, Any], now: datetime, weights: list[float]) -> float:
    w_triage, w_wait, w_age, w_gender = weights

    triage_level = priority_to_triage_level(patient.get("priority"))
    triage_score = (6 - triage_level) / 5.0
    wait_score = min(normalized_wait_hours(patient, now) / 48.0, 1.0)
    age_score = min(float(patient.get("age", 0)) / 85.0, 1.0)
    female_score = gender_score(patient)

    return (
        (w_triage * triage_score)
        + (w_wait * wait_score)
        + (w_age * age_score)
        + (w_gender * female_score)
    )


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

    state = build_state(payload, state_dim=state_dim)

    model = DDQN(state_dim=state_dim, action_dim=action_dim, hidden_dims=hidden_dims)
    model.load_state_dict(state_dict)
    model.eval()

    with torch.no_grad():
        q_values = model(torch.FloatTensor(state).unsqueeze(0)).squeeze(0).numpy()

    action = int(np.argmax(q_values))
    weights = action_to_weights(action, action_dim=action_dim)

    now = datetime.now(timezone.utc)
    queue = payload.get("targetWardQueue", [])

    sorted_queue = sorted(
        queue,
        key=lambda p: patient_score(p, now, weights),
        reverse=True,
    )

    print(
        json.dumps(
            {
                "orderedPatientIds": [p.get("id") for p in sorted_queue if p.get("id")],
                "meta": {
                    "action": action,
                    "actionDim": action_dim,
                    "stateDim": state_dim,
                    "hiddenDims": list(hidden_dims),
                    "weights": weights,
                    "qValues": [float(x) for x in q_values],
                    "modelApplied": True,
                },
            }
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
