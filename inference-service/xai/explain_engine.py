# -*- coding: utf-8 -*-
"""
explain_engine.py  (inference-service copy)
============================================
Explainability core for the MAPPO hospital bed-allocation model.

This is the hosted-service copy of xai/explain_engine.py.  The logic is
identical; the only difference is that imports reference `xai.forecaster`
(package-qualified) rather than the bare `forecaster` used in the root xai/
folder, so this file works correctly when imported from inference-service/.

Design (see the accompanying guide for the full rationale):

  Layer 1 - Exact priority decomposition (deterministic, zero approximation).
            The MAPPO action IS a linear formula (P = wt*(6-triage) + ww*wait),
            so we can explain "why is this patient #1 in queue" exactly,
            with no statistical approximation at all.

  Layer 2 - Per-agent negotiation transparency (specific to MAPPO). Shows
            each of the 5 triage agents' individual vote and how much it
            swayed the final combined (w_t, w_w).

  Layer 3 - SHAP feature attribution on each agent's policy network -- WHY
            did agent i's neural net choose that action given the ward
            state? This is the expensive, statistical layer; it is meant
            to be precomputed / cached, not run on every HTTP request.

  Layer 4 - Confidence signal (policy entropy per agent).

  Layer 5 - Template-based natural-language explanation stitching 1-4
            together into a sentence a nurse/consultant can actually read.

IMPORTANT: the state vector construction here (`build_state_vector`)
MUST mirror UnifiedFairEnv._state() from your training script exactly,
feature-for-feature, or the explanations will not match what the model
actually saw during training/simulation.
"""

import json
import re
from datetime import datetime, timezone
import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Categorical

# ============================================================
# 0. CONSTANTS -- copied verbatim from your MAPPO training script.
#    Do NOT change these independently of the training script; the action
#    grid, agent count and negotiation weights must match the checkpoint.
# ============================================================
W_T_LIST = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]   # 11 values
W_W_LIST = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]            # 9 values
N_ACTIONS = len(W_T_LIST) * len(W_W_LIST)                            # 99

N_AGENTS  = 5
ALPHA     = [0.40, 0.30, 0.15, 0.10, 0.05]
STATE_DIM = 10

TRIAGE_AGENT_NAMES = ["Critical", "Emergent", "Urgent", "Semi-urgent", "Non-urgent"]

FEATURE_NAMES = [
    "bed_occupancy_rate",       # occ
    "queue_length_norm",        # q_len
    "triage1_proportion",       # triage_dist[0]
    "triage2_proportion",       # triage_dist[1]
    "triage3_proportion",       # triage_dist[2]
    "triage4_proportion",       # triage_dist[3]
    "triage5_proportion",       # triage_dist[4]
    "longest_wait_norm",        # longest_wait
    "predicted_arrival_load",   # pred_load from ArrivalForecaster
    "predicted_critical_share", # pred_crit from ArrivalForecaster
]
assert len(FEATURE_NAMES) == STATE_DIM


# ============================================================
# 1. MODEL DEFINITIONS -- must be structurally identical to training script
#    so state_dict() loads without key/shape mismatches.
# ============================================================
class TriageActor(nn.Module):
    def __init__(self, state_dim=STATE_DIM, n_actions=N_ACTIONS, hidden=128):
        super().__init__()
        self.body = nn.Sequential(
            nn.Linear(state_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
        )
        self.head = nn.Linear(hidden, n_actions)

    def forward(self, x):
        return self.head(self.body(x))

    def probs(self, state_t):
        with torch.no_grad():
            logits = self.forward(state_t)
            return torch.softmax(logits, dim=-1)


class CentralizedCritic(nn.Module):
    def __init__(self, state_dim=STATE_DIM, hidden=128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
            nn.Linear(hidden, 1)
        )

    def forward(self, state):
        return self.net(state).squeeze(-1)


def load_mappo(checkpoint_path, device="cpu"):
    """Load the 5 triage actors (+ critic, unused for explanation but loaded
    for completeness) from a best_mappo_hospital.pth checkpoint."""
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    actors = [TriageActor().to(device) for _ in range(N_AGENTS)]
    for i, actor in enumerate(actors):
        actor.load_state_dict(ckpt[f"actor_{i}"])
        actor.eval()
    critic = CentralizedCritic().to(device)
    if "critic" in ckpt:
        critic.load_state_dict(ckpt["critic"])
    critic.eval()
    return actors, critic


def parse_triage_level(value):
    if value is None:
        return 5

    if isinstance(value, (int, float)):
        return int(np.clip(int(value), 1, 5))

    text = str(value).strip().lower()
    direct_map = {
        "critical": 1,
        "emergent": 2,
        "urgent": 3,
        "semi-urgent": 4,
        "non-urgent": 5,
    }
    if text in direct_map:
        return direct_map[text]

    match = re.search(r"\d+", text)
    if match:
        return int(np.clip(int(match.group()), 1, 5))

    return 5


def resolve_wait_minutes(patient):
    if "waitMinutes" in patient and patient["waitMinutes"] is not None:
        return max(0.0, float(patient["waitMinutes"]))

    if "queueWaitTime" in patient and patient["queueWaitTime"] is not None:
        return max(0.0, float(patient["queueWaitTime"]))

    if "waitHours" in patient and patient["waitHours"] is not None:
        return max(0.0, float(patient["waitHours"]) * 60.0)

    admission_time = patient.get("admissionTime")
    if not admission_time:
        return 0.0

    try:
        arrival = datetime.fromisoformat(str(admission_time).replace("Z", "+00:00"))
    except ValueError:
        return 0.0

    if arrival.tzinfo is None:
        arrival = arrival.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    return max(0.0, (now - arrival).total_seconds() / 60.0)


# ============================================================
# 2. STATE CONSTRUCTION FROM LIVE WARD DATA (MongoDB shape)
#    Mirrors UnifiedFairEnv._state() feature-for-feature, but reads from a
#    plain dict you build from your Ward/Patient Mongo documents instead of
#    the offline training CSV.
# ============================================================
def build_state_vector(ward_snapshot, forecaster=None, use_predictive=True):
    """
    ward_snapshot = {
        "totalBeds": int,
        "occupiedBeds": int,
        "queue": [
            {"patientId": str, "name": str, "triageLevel": int (1-5),
             "waitMinutes": float},
            ...
        ],
        "usePredictive": bool (optional),
        "patientHistory": list (optional, for live forecaster training)
    }
    Returns (state: np.ndarray[10], queue_with_wait_hours: list[dict], predictive_meta: dict)
    """
    if "totalBeds" not in ward_snapshot:
         raise ValueError("Missing required field: totalBeds")
    total_beds = max(int(ward_snapshot["totalBeds"]), 1)
    # total_beds = max(int(ward_snapshot["totalBeds"]), 1)
    occ = min(int(ward_snapshot["occupiedBeds"]) / total_beds, 1.0)

    queue = ward_snapshot.get("queue", [])
    q_len = min(len(queue) / 30.0, 1.0)

    triage_dist = np.zeros(5, dtype=np.float32)
    enriched_queue = []
    for p in queue:
        triage = parse_triage_level(p.get("triageLevel", p.get("priority")))
        wait_minutes = resolve_wait_minutes(p)
        wait_hours = wait_minutes / 60.0
        triage_dist[triage - 1] += 1
        enriched_queue.append({**p, "waitHours": wait_hours})

    longest_wait = 0.0
    if queue:
        triage_dist /= len(queue)
        longest_wait = min(max(q["waitHours"] for q in enriched_queue) / 48.0, 1.0)

    predictive_enabled = use_predictive and ward_snapshot.get("usePredictive", True)
    pred_load, pred_crit = 0.0, 0.0
    predictive_meta = {
        "enabled": bool(predictive_enabled),
        "pred_load": 0.0,
        "pred_crit": 0.0,
        "expected_arrivals": 0.0,
        "horizon_hours": 0,
        "surge_predicted": False,
    }

    if predictive_enabled:
        if forecaster is None:
            # Package-qualified import for the hosted service
            from xai.forecaster import load_forecaster

            forecaster = load_forecaster(ward_snapshot)
        prediction_details = forecaster.predict_details()
        pred_load = prediction_details["pred_load"]
        pred_crit = prediction_details["pred_crit"]
        thresholds = getattr(forecaster, "surge_thresholds", None)
        if thresholds is None:
            from xai.forecaster import default_surge_thresholds

            thresholds = default_surge_thresholds()
        predictive_meta.update(
            {
                "pred_load": round(float(pred_load), 4),
                "pred_crit": round(float(pred_crit), 4),
                "expected_arrivals": round(
                    float(prediction_details.get("expected_arrivals", 0.0)), 2
                ),
                "horizon_hours": int(prediction_details.get("horizon_hours", 0)),
                "surge_predicted": bool(
                    pred_load > thresholds["load"] and pred_crit > thresholds["crit"]
                ),
                "surge_thresholds": thresholds,
            }
        )

    state = np.array(
        [occ, q_len, *triage_dist, longest_wait, pred_load, pred_crit], dtype=np.float32
    )
    assert state.shape[0] == STATE_DIM
    return state, enriched_queue, predictive_meta


# ============================================================
# 3. NEGOTIATION -- copied verbatim from your MAPPO training script.
# ============================================================
def negotiate(actions):
    combined_wt, combined_ww = 0.0, 0.0
    per_agent = []
    for i, a in enumerate(actions):
        wt = W_T_LIST[a // len(W_W_LIST)]
        ww = W_W_LIST[a % len(W_W_LIST)]
        combined_wt += ALPHA[i] * wt
        combined_ww += ALPHA[i] * ww
        per_agent.append({
            "agent_index": i,
            "triage_class": TRIAGE_AGENT_NAMES[i],
            "action_index": int(a),
            "proposed_w_t": wt,
            "proposed_w_w": ww,
            "negotiation_influence_alpha": ALPHA[i],
            "contribution_to_combined_w_t": ALPHA[i] * wt,
            "contribution_to_combined_w_w": ALPHA[i] * ww,
        })
    return combined_wt, combined_ww, per_agent


# ============================================================
# 4. LAYER 1 -- exact per-patient priority decomposition
# ============================================================
def decompose_queue(queue_with_wait_hours, combined_wt, combined_ww):
    ranked = []
    for p in queue_with_wait_hours:
        triage = int(p["triageLevel"])
        wait_h = float(p["waitHours"])
        triage_requested = bool(p.get("triageRequested", False))
        urgency_term = combined_wt * (6 - triage)
        wait_term = combined_ww * wait_h
        score = urgency_term + wait_term
        total = urgency_term + wait_term
        urgency_pct = (urgency_term / total * 100.0) if total > 0 else 0.0
        wait_pct = 100.0 - urgency_pct if total > 0 else 0.0
        entry = {
            "patientId": p.get("patientId"),
            "name": p.get("name"),
            "triageLevel": triage,
            "triageRequested": triage_requested,
            "waitHours": round(wait_h, 2),
            "priorityScore": round(score, 4),
            "urgencyContribution": round(urgency_term, 4),
            "waitContribution": round(wait_term, 4),
            "urgencyShare": round(urgency_pct, 1),
            "waitShare": round(wait_pct, 1),
            "reason": (
                f"Ranked #{{rank}} mainly due to Triage {triage} urgency ({urgency_pct:.0f}% of score), "
                f"with {wait_h:.1f}h waiting adding the rest ({wait_pct:.0f}%)."
                if urgency_pct >= wait_pct
                else f"Ranked #{{rank}} mainly due to {wait_h:.1f}h waiting ({wait_pct:.0f}% of score), "
                f"with Triage {triage} urgency adding the rest ({urgency_pct:.0f}%)."
            ),
        }
        # Pass the positional index back so TypeScript can match without ambiguous ID lookups
        if "__queueIndex" in p and p["__queueIndex"] is not None:
            entry["__queueIndex"] = p["__queueIndex"]
        ranked.append(entry)
    ranked.sort(key=lambda r: r["priorityScore"], reverse=True)
    for rank, r in enumerate(ranked, start=1):
        r["rank"] = rank
        r["reason"] = r["reason"].replace("{rank}", str(rank))
        if r.get("triageRequested"):
            r["reason"] = (
                "Triage not yet set - using default urgency until a doctor confirms. "
                + r["reason"]
            )
    return ranked


# ============================================================
# 5. LAYER 4 -- policy confidence (entropy) per agent
# ============================================================
def agent_confidence(actors, state_t):
    out = []
    for i, actor in enumerate(actors):
        with torch.no_grad():
            logits = actor(state_t)
            probs = torch.softmax(logits, dim=-1)
            action_index = int(torch.argmax(probs, dim=-1).item())
            dist = Categorical(probs=probs)
            entropy = dist.entropy().item()
            # Normalize by max possible entropy (uniform over N_ACTIONS) -> [0,1]
            max_entropy = float(np.log(N_ACTIONS))
            confidence = 1.0 - (entropy / max_entropy)
        out.append({
            "agent_index": i,
            "triage_class": TRIAGE_AGENT_NAMES[i],
            "action_index": action_index,
            "action_confidence_0to1": round(float(probs[0, action_index].item()), 4),
            "policy_entropy": round(entropy, 4),
            "confidence_0to1": round(float(np.clip(confidence, 0.0, 1.0)), 4),
        })
    return out


# ============================================================
# 6. LAYER 3 -- SHAP feature attribution (expensive; call sparingly / cache)
# ============================================================
def shap_explain_agents(actors, state, background_states=None, n_samples=100):
    """
    Returns, for each agent, a dict of {feature_name: shap_value} explaining
    the softmax probability assigned to the agent's chosen (argmax) action.

    Uses shap.KernelExplainer, which treats the network as a black box, so
    this works regardless of PyTorch version and needs no autograd hooks.
    It is O(n_samples) forward passes PER AGENT, so this is deliberately
    kept out of the hot request path -- see explain.py's --with-shap flag
    and the guide's caching strategy.
    """
    import shap  # local import: keep this heavy/optional dep out of the fast path

    if background_states is None:
        rng = np.random.default_rng(42)
        background_states = state[None, :] + rng.normal(0, 0.05, size=(30, STATE_DIM))
        background_states = np.clip(background_states, 0.0, 1.0)

    results = {}
    for i, actor in enumerate(actors):
        def f(x_batch, _actor=actor):
            x_t = torch.tensor(x_batch, dtype=torch.float32)
            with torch.no_grad():
                probs = torch.softmax(_actor(x_t), dim=-1).numpy()
            return probs

        chosen_action = int(np.argmax(f(state[None, :])[0]))

        explainer = shap.KernelExplainer(
            lambda x: f(x)[:, chosen_action], background_states, silent=True
        )
        shap_values = explainer.shap_values(state[None, :], nsamples=n_samples, silent=True)
        shap_values = np.array(shap_values).reshape(-1)

        results[f"agent_{i}_{TRIAGE_AGENT_NAMES[i].lower()}"] = {
            FEATURE_NAMES[j]: round(float(shap_values[j]), 5)
            for j in range(STATE_DIM)
        }
    return results


# ============================================================
# 7. LAYER 5 -- natural-language explanation (deterministic template)
# ============================================================
def build_nlg_explanation(
    combined_wt,
    combined_ww,
    per_agent,
    ranked_queue,
    confidences,
    predictive_meta=None,
):
    if not ranked_queue:
        return "The queue is currently empty, so no prioritization decision was made."

    dominant_style = "medical urgency" if combined_wt >= combined_ww else "waiting time"
    top = ranked_queue[0]

    influential_agents = sorted(per_agent, key=lambda a: a["negotiation_influence_alpha"], reverse=True)[:2]
    influential_names = " and ".join(a["triage_class"] for a in influential_agents)
    influential_share = sum(a["negotiation_influence_alpha"] for a in influential_agents) * 100

    least_confident = min(confidences, key=lambda c: c["confidence_0to1"])

    lines = []
    predictive_meta = predictive_meta or {}
    if predictive_meta.get("enabled"):
        surge_text = (
            " A predicted critical-arrival surge was detected, so the policy is biased toward "
            "preserving bed capacity for incoming high-acuity patients."
            if predictive_meta.get("surge_predicted")
            else (
                " Predictive analytics shows moderate incoming load "
                f"(load {predictive_meta.get('pred_load', 0):.2f}, "
                f"critical arrivals {predictive_meta.get('pred_crit', 0):.2f})."
            )
        )
        lines.append(surge_text.strip())

    lines.append(
        f"This ward is currently weighting {dominant_style} more heavily "
        f"(urgency weight {combined_wt:.2f} vs waiting-time weight {combined_ww:.2f}), "
        f"a compromise negotiated across all 5 triage agents, with the "
        f"{influential_names} agents carrying the most influence "
        f"({influential_share:.0f}% combined)."
    )
    lines.append(
        f"Top of queue is {top['name']} (Triage {top['triageLevel']}), ranked #1 of "
        f"{len(ranked_queue)}: urgency contributed {top['urgencyContribution']:.2f} "
        f"({top['urgencyShare']:.0f}%) and waiting time contributed "
        f"{top['waitContribution']:.2f} ({top['waitShare']:.0f}%) to a total priority "
        f"score of {top['priorityScore']:.2f}."
    )
    lines.append(
        f"Agent {least_confident['triage_class']} was the least decisive this round "
        f"(confidence {least_confident['confidence_0to1']:.0%}), meaning several "
        f"weighting options looked similarly good to it given the current ward state."
    )
    return " ".join(lines)


# ============================================================
# 8. TOP-LEVEL ENTRY POINT
# ============================================================
def explain_decision(
    ward_snapshot,
    checkpoint_path,
    device="cpu",
    with_shap=False,
    background_states=None,
    shap_samples=100,
    forecaster_profile_path=None,
):
    # Package-qualified import for the hosted service
    from xai.forecaster import load_forecaster

    actors, _critic = load_mappo(checkpoint_path, device=device)
    forecaster = load_forecaster(ward_snapshot, profile_path=forecaster_profile_path)
    state, enriched_queue, predictive_meta = build_state_vector(
        ward_snapshot,
        forecaster=forecaster,
        use_predictive=ward_snapshot.get("usePredictive", True),
    )
    state_t = torch.tensor(state, dtype=torch.float32).unsqueeze(0).to(device)

    actions = []
    with torch.no_grad():
        for actor in actors:
            probs = actor.probs(state_t)
            actions.append(int(torch.argmax(probs, dim=-1).item()))

    combined_wt, combined_ww, per_agent = negotiate(actions)
    ranked_queue = decompose_queue(enriched_queue, combined_wt, combined_ww)
    confidences = agent_confidence(actors, state_t)

    result = {
        "state_vector": {FEATURE_NAMES[i]: round(float(state[i]), 4) for i in range(STATE_DIM)},
        "predictive_analytics": predictive_meta,
        "combined_weights": {"w_t_urgency": round(combined_wt, 4), "w_w_wait": round(combined_ww, 4)},
        "agent_votes": per_agent,
        "agent_confidence": confidences,
        "ranked_queue": ranked_queue,
        "explanation_text": build_nlg_explanation(
            combined_wt,
            combined_ww,
            per_agent,
            ranked_queue,
            confidences,
            predictive_meta=predictive_meta,
        ),
    }

    if with_shap:
        try:
            result["shap_feature_attribution"] = shap_explain_agents(
                actors, state, background_states=background_states, n_samples=shap_samples
            )
        except Exception as e:  # noqa: BLE001 - degrade gracefully, never break the API
            result["shap_feature_attribution"] = None
            result["shap_error"] = str(e)

    return result
