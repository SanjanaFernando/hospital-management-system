#!/usr/bin/env python3
"""
Generate a fixed validation holdout set from real historical ward snapshots.

The holdout is aligned to the current predictive model: 17-dim state vectors built
by the same forecaster-backed state builder used at inference time.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

sys.path.insert(0, str(PROJECT_ROOT / 'inference-service'))

from queue_reorder_lib import build_state, build_mappo_state  # noqa: E402
from xai.forecaster import load_forecaster  # noqa: E402
from mlops.scripts.generate_training_data import collect_historical_data  # noqa: E402


def generate_holdout_states(days: int = 30, max_samples: int = 500, seed: int = 42) -> tuple[np.ndarray, list[dict]]:
    """Build a fixed real-data validation set from historical snapshots."""
    snapshots = collect_historical_data(days=days)
    if not snapshots:
        raise RuntimeError(
            'No historical ward snapshots were found. '
            'Ensure MongoDB contains the hospital data required by generate_training_data.py.'
        )

    states = []
    queue_samples = []
    for snapshot in snapshots:
        queue = snapshot.get('queue', [])
        payload = {
            'targetWardQueue': queue,
            'targetWardTotalBeds': snapshot.get('totalBeds', 37),
            'targetWardOccupiedBeds': snapshot.get('occupiedBeds', 0),
        }
        forecast = load_forecaster(payload)
        details = forecast.predict_details()
        payload['_pred_load'] = float(details.get('pred_load', 0.0))
        payload['_pred_crit'] = float(details.get('pred_crit', 0.0))
        state = build_state(payload, state_dim=17, action_dim=25)
        states.append(state)
        queue_samples.append({'queue': queue})

    states = np.asarray(states, dtype=np.float32)
    if states.ndim != 2 or states.shape[1] != 17:
        raise ValueError(f'Unexpected validation state shape: {states.shape}. Expected (n, 17).')

    if max_samples and len(states) > max_samples:
        rng = np.random.default_rng(seed)
        selected = rng.choice(len(states), size=max_samples, replace=False)
        states = states[selected]
        queue_samples = [queue_samples[int(i)] for i in selected]

    return states, queue_samples


def main():
    parser = argparse.ArgumentParser(description='Generate a fixed validation holdout from real hospital data')
    parser.add_argument('--days', type=int, default=30, help='Days of historical data to include')
    parser.add_argument('--output', type=str, default='mlops/data/validation_holdout.npy', help='Where to save the holdout .npy file')
    parser.add_argument('--max-samples', type=int, default=500, help='Maximum number of real samples to keep in the holdout')
    parser.add_argument('--seed', type=int, default=42, help='Random seed for deterministic sample selection')
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    states, queue_samples = generate_holdout_states(days=args.days, max_samples=args.max_samples, seed=args.seed)
    np.save(output_path, states)

    metadata = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'state_dim': int(states.shape[1]),
        'n_samples': int(states.shape[0]),
        'source': 'collect_historical_data',
        'days_collected': args.days,
        'seed': args.seed,
        'max_samples': args.max_samples,
        'samples': queue_samples,
    }
    metadata_path = output_path.with_name(output_path.stem + '_metadata.json')
    with metadata_path.open('w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)

    print(f'Saved real validation holdout to {output_path}')
    print(f'Shape: {states.shape}, dtype: {states.dtype}')
    print(f'Queue metadata saved to {metadata_path}')


if __name__ == '__main__':
    main()
