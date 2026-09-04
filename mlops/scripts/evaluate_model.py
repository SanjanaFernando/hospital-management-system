#!/usr/bin/env python3
"""
Evaluate the deployed predictive MAPPO actor using a real validation holdout.

This evaluator uses the single shared actor architecture that matches the
production checkpoint: 17-dim state input and 25 action logits.
"""

import argparse
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

try:  # pragma: no cover
    from scipy.stats import spearmanr
except ImportError:  # pragma: no cover
    spearmanr = None

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mlops/logs/evaluation/evaluation.log'),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

_MAPPO_W_T_LIST = [0.0, 0.25, 0.5, 0.75, 1.0]
_MAPPO_W_W_LIST = [0.0, 0.15, 0.3, 0.5, 0.7]


class MAPPOActor(nn.Module):
    """Single shared actor used by the real predictive model checkpoint."""

    def __init__(self, state_dim: int = 17, n_actions: int = 25):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 256), nn.Tanh(),
            nn.Linear(256, 256), nn.Tanh(),
            nn.Linear(256, 128), nn.Tanh(),
            nn.Linear(128, n_actions),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def infer_state_dim_and_action_dim(state_dict: dict[str, torch.Tensor]) -> tuple[int, int]:
    weights = sorted(
        (key, value) for key, value in state_dict.items()
        if key.startswith('net.') and key.endswith('.weight')
    )
    if not weights:
        raise ValueError('Unsupported checkpoint structure: no net.*.weight tensors found.')
    state_dim = int(weights[0][1].shape[1])
    action_dim = int(weights[-1][1].shape[0])
    return state_dim, action_dim


def load_model(model_path: str, state_dim: int = 17, action_dim: int = 25, device: str = 'cpu') -> nn.Module:
    logger.info(f'Loading MAPPO actor from {model_path}...')

    checkpoint = torch.load(model_path, map_location=device, weights_only=False)
    if isinstance(checkpoint, dict) and 'state_dict' in checkpoint:
        state_dict = checkpoint['state_dict']
    elif isinstance(checkpoint, dict) and any(k.startswith('net.') for k in checkpoint):
        state_dict = checkpoint
    else:
        raise ValueError('Unsupported checkpoint format: expected a state_dict-like object.')

    inferred_state_dim, inferred_action_dim = infer_state_dim_and_action_dim(state_dict)
    model = MAPPOActor(state_dim=state_dim or inferred_state_dim, n_actions=action_dim or inferred_action_dim).to(device)
    model.load_state_dict(state_dict)
    model.eval()

    logger.info(
        'MAPPO actor loaded successfully '
        f'(state_dim={state_dim or inferred_state_dim}, action_dim={action_dim or inferred_action_dim})'
    )
    return model


def decode_action_to_weights(action: int) -> tuple[float, float]:
    w_triage = _MAPPO_W_T_LIST[max(0, min(action // 5, len(_MAPPO_W_T_LIST) - 1))]
    w_wait = _MAPPO_W_W_LIST[max(0, min(action % 5, len(_MAPPO_W_W_LIST) - 1))]
    return float(w_triage), float(w_wait)


def priority_to_triage_level(priority: str | None) -> int:
    mapping = {
        'Triage 1': 1,
        'Critical': 1,
        'Triage 2': 2,
        'Emergent': 2,
        'Triage 3': 3,
        'Urgent': 3,
        'Triage 4': 4,
        'Semi-urgent': 4,
        'Triage 5': 5,
        'Non-urgent': 5,
    }
    if priority is None:
        return 5
    return mapping.get(priority, 5)


def normalized_wait_hours(patient: dict, now: datetime) -> float:
    queue_wait = patient.get('queueWaitTime') or patient.get('waitMinutes')
    if isinstance(queue_wait, (int, float)):
        return max(0.0, float(queue_wait) / 60.0)

    admission = patient.get('admissionTime')
    if not admission:
        return 0.0
    try:
        if isinstance(admission, str):
            if admission.endswith('Z'):
                admission = admission.replace('Z', '+00:00')
            arrival = datetime.fromisoformat(admission)
        else:
            arrival = admission
        if arrival.tzinfo is None:
            arrival = arrival.replace(tzinfo=timezone.utc)
        return max(0.0, (now - arrival).total_seconds() / 3600.0)
    except (TypeError, ValueError):
        return 0.0


def patient_score(patient: dict, now: datetime, weights: tuple[float, float]) -> float:
    triage_level = priority_to_triage_level(patient.get('priority'))
    wait_hours = normalized_wait_hours(patient, now)
    w_triage, w_wait = weights
    triage_score = (6 - triage_level) / 5.0
    wait_score = min(wait_hours / 24.0, 1.0)
    return (w_triage * triage_score) + (w_wait * wait_score)


def compute_signed_spearman(x: np.ndarray, y: np.ndarray) -> float:
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    if len(x) != len(y) or len(x) < 2:
        return 0.0
    if spearmanr is not None:
        rho, _ = spearmanr(x, y)
        if np.isnan(rho):
            return 0.0
        return float(rho)

    ranks_x = np.argsort(np.argsort(x)) + 1
    ranks_y = np.argsort(np.argsort(y)) + 1
    x_centered = ranks_x - np.mean(ranks_x)
    y_centered = ranks_y - np.mean(ranks_y)
    denom = np.linalg.norm(x_centered) * np.linalg.norm(y_centered)
    if denom == 0.0:
        return 0.0
    return float(np.dot(x_centered, y_centered) / denom)


def calculate_inference_latency(model: nn.Module, test_inputs: torch.Tensor, num_runs: int = 100, device: str = 'cpu') -> dict:
    logger.info(f'Calculating inference latency ({num_runs} runs)...')
    latencies = []
    with torch.no_grad():
        for _ in range(num_runs):
            start = time.time()
            _ = model(test_inputs[0:1].to(device))
            latencies.append((time.time() - start) * 1000.0)

    latencies = np.array(latencies, dtype=np.float64)
    return {
        'mean_ms': float(np.mean(latencies)),
        'median_ms': float(np.median(latencies)),
        'std_ms': float(np.std(latencies)),
        'min_ms': float(np.min(latencies)),
        'max_ms': float(np.max(latencies)),
    }


def calculate_efficiency_score(model: nn.Module, test_inputs: torch.Tensor, device: str = 'cpu') -> float:
    logger.info('Calculating efficiency score...')
    confidences = []
    with torch.no_grad():
        for state in test_inputs:
            logits = model(state.unsqueeze(0).to(device))
            probs = torch.softmax(logits, dim=-1)
            confidences.append(float(torch.max(probs).item()))
    efficiency = float(np.mean(confidences))
    return float(np.clip(efficiency, 0.0, 1.0))


def calculate_accuracy(model: nn.Module, test_inputs: torch.Tensor, device: str = 'cpu') -> float:
    """Heuristic bucket-matching sanity check only: there is no real ground-truth action label to compare against."""
    logger.info('Calculating accuracy (heuristic directionality check)...')
    matches = 0
    total = 0

    with torch.no_grad():
        for state in test_inputs:
            logits = model(state.unsqueeze(0).to(device))
            action = int(torch.argmax(logits, dim=-1).item())
            w_t, w_w = decode_action_to_weights(action)

            triage_signal = (
                1.0 * float(state[6]) + 0.8 * float(state[7]) + 0.6 * float(state[8])
                + 0.4 * float(state[9]) + 0.2 * float(state[10])
            )
            wait_signal = 0.7 * float(state[11]) + 0.3 * float(state[12])

            if triage_signal > wait_signal + 0.05:
                expected_bucket = 'triage_heavy'
            elif wait_signal > triage_signal + 0.05:
                expected_bucket = 'wait_heavy'
            else:
                expected_bucket = 'balanced'

            if w_t >= 0.75 and w_t > w_w:
                actual_bucket = 'triage_heavy'
            elif w_w >= 0.5 and w_w > w_t:
                actual_bucket = 'wait_heavy'
            else:
                actual_bucket = 'balanced'

            if actual_bucket == expected_bucket:
                matches += 1
            total += 1

    if total == 0:
        return 0.0
    return float(np.clip(matches / total, 0.0, 1.0))


def calculate_fairness_score(model: nn.Module, holdout_samples: list[dict], device: str = 'cpu') -> tuple[float, int, int, str]:
    """Use queue-order fairness via signed Spearman. Skip below n=3; report sample counts."""
    logger.info('Calculating fairness score...')
    valid_rhos = []
    used_samples = 0
    total_samples = len(holdout_samples)

    for sample in holdout_samples:
        queue = sample.get('queue') or []
        if len(queue) < 3:
            continue

        state = sample.get('state')
        if state is None:
            continue

        with torch.no_grad():
            logits = model(torch.tensor(state, dtype=torch.float32, device=device).unsqueeze(0))
            action = int(torch.argmax(logits, dim=-1).item())
        w_triage, w_wait = decode_action_to_weights(action)
        weights = (w_triage, w_wait)

        now = datetime.now(timezone.utc)
        reordered_queue = sorted(queue, key=lambda patient: patient_score(patient, now, weights), reverse=True)
        urgency_values = np.array([
            float(6 - priority_to_triage_level(patient.get('priority')))
            for patient in reordered_queue
        ], dtype=np.float64)
        ranked_positions = np.arange(len(reordered_queue), 0, -1, dtype=np.float64)

        rho = compute_signed_spearman(ranked_positions, urgency_values)
        if np.isnan(rho):
            continue
        valid_rhos.append(float(rho))
        used_samples += 1

    if valid_rhos:
        fairness_score = float(np.mean(valid_rhos))
        method = 'queue_order_spearman_signed'
    else:
        triage_tendencies = []
        for sample in holdout_samples:
            state = sample.get('state')
            if state is None:
                continue
            with torch.no_grad():
                logits = model(torch.tensor(state, dtype=torch.float32, device=device).unsqueeze(0))
                action = int(torch.argmax(logits, dim=-1).item())
            w_triage, _ = decode_action_to_weights(action)
            triage_tendencies.append(w_triage)
        fairness_score = float(np.mean(triage_tendencies)) if triage_tendencies else 0.0
        method = 'mean_w_triage_proxy'

    logger.info('Fairness score computed with %s on %d/%d samples.', method, used_samples, total_samples)
    return float(np.clip(fairness_score, -1.0, 1.0)), used_samples, total_samples, method


def load_holdout_samples(holdout_path: Path) -> tuple[np.ndarray, list[dict]]:
    states = np.load(holdout_path).astype(np.float32)
    metadata_path = holdout_path.with_name(holdout_path.stem + '_metadata.json')
    queue_samples: list[dict] = []

    if metadata_path.exists():
        with metadata_path.open('r', encoding='utf-8') as file:
            payload = json.load(file)
        for entry in payload.get('samples', []):
            queue_samples.append({'state': None, 'queue': entry.get('queue', [])})

    if len(queue_samples) == 0:
        queue_samples = [{'state': None, 'queue': []} for _ in range(len(states))]

    if len(queue_samples) != len(states):
        if len(states) > 0 and len(queue_samples) > 0:
            queue_samples = queue_samples[: len(states)] + [
                {'state': None, 'queue': []} for _ in range(max(0, len(states) - len(queue_samples)))
            ]

    return states, [
        {'state': state, 'queue': qs.get('queue', [])}
        for state, qs in zip(states, queue_samples)
    ]


def main():
    parser = argparse.ArgumentParser(description='Evaluate MAPPO predictive model')
    parser.add_argument('--model', type=str, required=True, help='Model path')
    parser.add_argument('--data', type=str, default='mlops/data/validation_holdout.npy', help='Holdout data path')
    parser.add_argument('--output', type=str, default=None, help='Output performance metrics file')
    parser.add_argument('--device', type=str, default='cuda' if torch.cuda.is_available() else 'cpu', help='Device (cuda/cpu)')

    args = parser.parse_args()

    logger.info(f'Using device: {args.device}')
    logger.info('Starting predictive MAPPO evaluation...')

    with open('mlops/config/model_config.json', 'r', encoding='utf-8') as handle:
        model_config = json.load(handle)
    arch = model_config['architecture']

    model = load_model(
        args.model,
        state_dim=arch['state_dim'],
        action_dim=arch['action_dim'],
        device=args.device,
    )

    holdout_path = Path(args.data)
    if not holdout_path.exists():
        raise FileNotFoundError(f'Validation holdout not found at {holdout_path}. Run mlops/scripts/generate_validation_holdout.py first.')

    logger.info(f'Loading real validation holdout from {holdout_path}...')
    holdout_states, holdout_samples = load_holdout_samples(holdout_path)
    if holdout_states.ndim != 2 or holdout_states.shape[1] != arch['state_dim']:
        raise ValueError(f'Validation holdout has shape {holdout_states.shape}, expected (n_samples, {arch["state_dim"]}).')

    test_inputs = torch.from_numpy(holdout_states).to(args.device)

    latency_metrics = calculate_inference_latency(model, test_inputs, num_runs=100, device=args.device)
    efficiency_score = calculate_efficiency_score(model, test_inputs, device=args.device)
    accuracy = calculate_accuracy(model, test_inputs, device=args.device)
    fairness_score, fairness_used, fairness_total, fairness_method = calculate_fairness_score(model, holdout_samples, device=args.device)

    performance = {
        'evaluation_timestamp': datetime.now(timezone.utc).isoformat(),
        'model_path': args.model,
        'model_type': 'MAPPO',
        'metrics': {
            'fairness_score': fairness_score,
            'fairness_method': fairness_method,
            'fairness_samples_used': fairness_used,
            'fairness_total_samples': fairness_total,
            'efficiency_score': efficiency_score,
            'accuracy': accuracy,
            'inference_latency': latency_metrics,
        },
        'test_dataset': {
            'samples': len(test_inputs),
            'state_dim': arch['state_dim'],
            'action_dim': arch['action_dim'],
        },
        'performance_targets': model_config['performance_targets'],
    }

    logger.info(f'Fairness Score: {fairness_score:.4f} ({fairness_method})')
    logger.info(f'Fairness samples used: {fairness_used}/{fairness_total}')
    logger.info(f'Efficiency Score: {efficiency_score:.4f}')
    logger.info(f'Accuracy: {accuracy:.4f}')
    logger.info(f'Avg Latency: {latency_metrics["mean_ms"]:.2f}ms')

    output_file = Path(args.output) if args.output else Path(args.model).with_name('performance.json')
    with output_file.open('w', encoding='utf-8') as handle:
        json.dump(performance, handle, indent=2)

    logger.info(f'Performance metrics saved to {output_file}')

    print('\n' + '=' * 60)
    print('PREDICTIVE MAPPO EVALUATION SUMMARY')
    print('=' * 60)
    print(f'Fairness Score:   {fairness_score:.4f}')
    print(f'Fairness Method:  {fairness_method} ({fairness_used}/{fairness_total})')
    print(f'Efficiency Score: {efficiency_score:.4f} / 1.00')
    print(f'Accuracy:         {accuracy:.4f} / 1.00')
    print(f'Avg Latency:      {latency_metrics["mean_ms"]:.2f}ms')
    print('=' * 60 + '\n')


if __name__ == '__main__':
    main()
