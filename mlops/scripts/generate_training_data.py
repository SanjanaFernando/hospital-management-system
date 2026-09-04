#!/usr/bin/env python3
"""
Generate training data from historical MongoDB ward snapshots.

This script aligns with the real deployed predictive MAPPO model:
- 17-dim state vector built by the same runtime builder as inference
- 25-action output grid (5 triage weights × 5 wait weights)
- forecaster-backed load/critical predictions added to the state vector

It intentionally does not modify the RL training loop or environment code.
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import torch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

INFERENCE_ROOT = PROJECT_ROOT / 'inference-service'
if str(INFERENCE_ROOT) not in sys.path:
    sys.path.insert(0, str(INFERENCE_ROOT))

from queue_reorder_lib import build_state  # noqa: E402
from xai.forecaster import load_forecaster  # noqa: E402


def load_env() -> None:
    """Load .env file from project root."""
    env_path = PROJECT_ROOT / '.env'
    if not env_path.exists():
        return
    with env_path.open('r', encoding='utf-8') as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


load_env()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)


def get_mongodb_config() -> tuple[str, str]:
    uri = os.getenv('MONGODB_URI')
    db_name = os.getenv('MONGODB_DB', 'hospital-management')
    if not uri:
        logger.warning('MONGODB_URI not set. Using local MongoDB.')
        uri = 'mongodb://localhost:27017/hospital_db'
        db_name = 'hospital_db'
    return uri, db_name


def collect_historical_data(days: int = 7) -> list[dict[str, Any]]:
    """Collect ward snapshots from the last N days."""
    try:
        from pymongo import MongoClient
    except ImportError:
        logger.error('pymongo not installed. Install with: pip install pymongo')
        return []

    logger.info(f'Collecting ward data from last {days} days...')
    uri, db_name = get_mongodb_config()
    logger.info(f'Connecting to MongoDB: {db_name}')

    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=10000)
        client.server_info()
        logger.info('MongoDB connection successful')
    except Exception as exc:  # pragma: no cover - depends on env
        logger.error(f'Failed to connect to MongoDB: {exc}')
        logger.error(f'URI: {uri[:50]}...')
        return []

    db = client[db_name]
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    snapshots: list[dict[str, Any]] = []

    if 'ward_snapshots' in db.list_collection_names():
        logger.info('Found ward_snapshots collection')
        cursor = db.ward_snapshots.find({"timestamp": {"$gte": cutoff_date}})
        snapshots = list(cursor)
        logger.info(f'Found {len(snapshots)} historical snapshots')

    if not snapshots:
        logger.info('Constructing snapshots from patients/wards collections...')
        wards = list(db.wards.find())
        logger.info(f'Found {len(wards)} wards')
        for ward in wards:
            ward_id = ward.get('wardId') or str(ward.get('_id'))
            patients = list(db.patients.find({
                'wardId': ward_id,
                'admissionTime': {'$gte': cutoff_date},
            }))
            queued_patients = list(db.patients.find({
                 'wardId': ward_id,
                 'status': 'queued',
            }))
            snapshot = {
                'wardId': ward_id,
                'name': ward.get('name', f'Ward {ward_id}'),
                'totalBeds': ward.get('totalBeds', 37),
                'occupiedBeds': len(patients),
                'queue': [],
                'timestamp': datetime.now(timezone.utc),
            }
            for patient in queued_patients:
                snapshot['queue'].append({
                    'id': str(patient.get('_id')),
                    'name': patient.get('name', 'Unknown'),
                    'priority': patient.get('priority', 'Triage 5'),
                    'queueWaitTime': patient.get('queueWaitTime', 0),
                    'admissionTime': patient.get('admissionTime'),
                    'age': patient.get('age', 0),
                    'gender': patient.get('gender', 'M'),
                })
            snapshots.append(snapshot)

    client.close()
    return snapshots


class DummyModel:
    """Fallback expert policy when no model is available."""

    def __init__(self, state_dim: int = 17, action_dim: int = 25):
        self.state_dim = state_dim
        self.action_dim = action_dim

    def predict(self, state: np.ndarray) -> int:
        occ = float(state[0])
        q_len = float(state[3])
        triage_dist = state[6:11]
        longest_wait = float(state[11])

        has_critical = triage_dist[0] > 0.2
        long_wait = longest_wait > 0.5

        if has_critical and long_wait:
            action_idx = 10
        elif has_critical:
            action_idx = 4
        elif long_wait:
            action_idx = 18
        else:
            action_idx = 10

        if occ > 0.8 and q_len > 0.6:
            action_idx = 12
        return min(action_idx, self.action_dim - 1)


def load_expert_model(model_path: str | None = None, state_dim: int = 17, action_dim: int = 25):
    if model_path and Path(model_path).exists():
        logger.info(f'Loading expert model from {model_path}')
        try:
            from inference_service.queue_reorder_lib import MAPPOActor  # noqa: F401
            state = torch.load(model_path, map_location='cpu', weights_only=False)
            if isinstance(state, dict) and 'state_dict' in state:
                model = state['state_dict']
                return {'state_dict': model, 'state_dim': state_dim, 'action_dim': action_dim}, {'state_dim': state_dim, 'action_dim': action_dim}
        except Exception as exc:  # pragma: no cover
            logger.warning(f'Failed to load model: {exc}. Using dummy expert.')

    logger.info('Using dummy expert policy (heuristic-based)')
    return DummyModel(state_dim, action_dim), {'state_dim': state_dim, 'action_dim': action_dim}


def get_expert_action(model, state: np.ndarray, action_dim: int) -> int:
    if hasattr(model, 'predict'):
        return int(model.predict(state))

    state_tensor = torch.FloatTensor(state).unsqueeze(0)
    with torch.no_grad():
        q_values = model(state_tensor).squeeze(0).numpy()
    q_values[0] = -np.inf
    return int(np.argmax(q_values))


def build_predictive_training_state(snapshot: dict[str, Any]) -> np.ndarray:
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
    return build_state(payload, state_dim=17, action_dim=25).astype(np.float32)


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate training data from historical ward data')
    parser.add_argument('--days', type=int, default=7, help='Number of days of history to use')
    parser.add_argument('--output', type=str, default='mlops/data/processed', help='Output directory')
    parser.add_argument('--model', type=str, default=None, help='Path to expert model (optional)')
    parser.add_argument('--augment', type=int, default=50, help='Data augmentation factor')
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)

    snapshots = collect_historical_data(days=args.days)
    if not snapshots:
        logger.error('No historical data found. Please ensure MongoDB has patient/ward data.')
        return

    model, meta = load_expert_model(args.model, state_dim=17, action_dim=25)
    state_dim = meta['state_dim']
    action_dim = meta['action_dim']

    logger.info(f'Generating predictive training samples (augmentation={args.augment})...')
    states = []
    actions = []

    for snapshot in snapshots:
        base_state = build_predictive_training_state(snapshot)
        if base_state.shape[0] != state_dim:
            base_state = base_state[:state_dim]
            if base_state.shape[0] < state_dim:
                base_state = np.pad(base_state, (0, state_dim - base_state.shape[0]), 'constant')

        for _ in range(args.augment):
            noise = np.random.normal(0, 0.01, size=base_state.shape).astype(np.float32)
            noisy_state = np.clip(base_state + noise, 0.0, 1.0).astype(np.float32)
            action = get_expert_action(model, noisy_state, action_dim)
            states.append(noisy_state)
            actions.append(action)

    states = np.array(states, dtype=np.float32)
    actions = np.array(actions, dtype=np.int64)

    logger.info(f'Generated {len(states)} predictive training samples')
    logger.info(f'State shape: {states.shape}, Action shape: {actions.shape}')
    logger.info(f'State range: [{states.min():.3f}, {states.max():.3f}]')
    logger.info(f'Action distribution: {np.bincount(actions, minlength=action_dim)}')

    np.save(output_path / 'states.npy', states)
    np.save(output_path / 'actions.npy', actions)

    metadata = {
        'n_samples': len(states),
        'state_dim': int(state_dim),
        'action_dim': int(action_dim),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'source': 'mongodb_historical',
        'days_collected': args.days,
        'augmentation': args.augment,
        'expert_model': str(args.model) if args.model else 'dummy_heuristic',
    }
    with (output_path / 'metadata.json').open('w', encoding='utf-8') as file:
        json.dump(metadata, file, indent=2)

    logger.info(f'Saved training data to {output_path}')
    logger.info(f'  - states.npy: {states.shape}')
    logger.info(f'  - actions.npy: {actions.shape}')
    logger.info('  - metadata.json')


if __name__ == '__main__':
    main()
