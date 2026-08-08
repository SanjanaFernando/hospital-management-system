#!/usr/bin/env python3
"""
Generate training data from historical MongoDB ward snapshots.

This script:
1. Queries MongoDB for historical ward/patient data (last N days)
2. Builds state vectors using the SAME logic as inference (build_state)
3. Generates expert actions using the current production model
4. Saves (state, action) pairs for training

Usage:
    python mlops/scripts/generate_training_data.py \
        --days 7 \
        --output mlops/data/processed \
        --model model/best_mappo_hospital.pth
"""

import json
import argparse
import logging
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
import torch

# Add inference-service to path for importing build_state
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "inference-service"))

# Load environment variables from .env file
def load_env():
    """Load .env file from project root."""
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    import os
                    os.environ[key] = value

load_env()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# ============================================================
# State Vector Construction (MUST match inference exactly)
# ============================================================

def priority_to_triage_level(priority: str | None) -> int:
    """Convert priority string to triage level (1-5)."""
    mapping = {
        "Triage 1": 1, "Critical": 1,
        "Triage 2": 2, "Emergent": 2,
        "Triage 3": 3, "Urgent": 3,
        "Triage 4": 4, "Semi-urgent": 4,
        "Triage 5": 5, "Non-urgent": 5,
    }
    return mapping.get(priority, 5)


def normalized_wait_hours(patient: dict[str, Any], now: datetime) -> float:
    """Calculate wait time in hours."""
    queue_wait = patient.get("queueWaitTime") or patient.get("waitMinutes")
    if isinstance(queue_wait, (int, float)):
        return max(0.0, float(queue_wait) / 60.0)

    admission = patient.get("admissionTime")
    if not admission:
        return 0.0

    try:
        if isinstance(admission, str):
            if admission.endswith("Z"):
                admission = admission.replace("Z", "+00:00")
            arrival = datetime.fromisoformat(admission)
        else:
            arrival = admission
        
        if arrival.tzinfo is None:
            arrival = arrival.replace(tzinfo=timezone.utc)
        return max(0.0, (now - arrival).total_seconds() / 3600.0)
    except (ValueError, TypeError):
        return 0.0


def build_training_state(payload: dict[str, Any], state_dim: int = 10) -> np.ndarray:
    """Build 10-dimensional state vector (matches MAPPO training state).
    
    Features: [occ, q_len, triage_dist(5), longest_wait, 0.0, 0.0]
    """
    queue = payload.get("targetWardQueue", payload.get("queue", []))
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

    state = np.array(
        [occ, q_len, *triage_dist, longest_wait, 0.0, 0.0],
        dtype=np.float32,
    )

    if len(state) < state_dim:
        state = np.pad(state, (0, state_dim - len(state)), "constant")

    return state[:state_dim]


# ============================================================
# Data Collection from MongoDB
# ============================================================

def get_mongodb_config() -> tuple[str, str]:
    """Get MongoDB connection URI and database name from environment."""
    import os
    uri = os.getenv('MONGODB_URI')
    db_name = os.getenv('MONGODB_DB', 'hospital-management')
    
    if not uri:

        logger.warning("MONGODB_URI not set. Using local MongoDB.")
        uri = "mongodb://localhost:27017/hospital_db"
        db_name = "hospital_db"
    
    return uri, db_name


def collect_historical_data(days: int = 7) -> list[dict[str, Any]]:
    """Collect ward snapshots from the last N days."""
    try:
        from pymongo import MongoClient
    except ImportError:
        logger.error("pymongo not installed. Install with: pip install pymongo")
        return []

    logger.info(f"Collecting ward data from last {days} days...")
    
    uri, db_name = get_mongodb_config()
    logger.info(f"Connecting to MongoDB: {db_name}")
    
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=10000)
        # Test connection
        client.server_info()
        logger.info("✅ MongoDB connection successful")
    except Exception as e:
        logger.error(f"❌ Failed to connect to MongoDB: {e}")
        logger.error(f"   URI: {uri[:50]}...")
        return []
    
    db = client[db_name]
    
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Try to find ward snapshots collection
    # If it doesn't exist, we'll construct snapshots from patients/wards
    snapshots = []
    
    # Option 1: Look for pre-collected snapshots
    if 'ward_snapshots' in db.list_collection_names():
        logger.info("Found ward_snapshots collection")
        cursor = db.ward_snapshots.find({
            "timestamp": {"$gte": cutoff_date}
        })
        snapshots = list(cursor)
        logger.info(f"Found {len(snapshots)} historical snapshots")
    
    # Option 2: Construct snapshots from current data
    if not snapshots:
        logger.info("Constructing snapshots from patients/wards collections...")
        
        # Get all wards
        wards = list(db.wards.find())
        logger.info(f"Found {len(wards)} wards")
        
        for ward in wards:
            ward_id = str(ward.get('_id', ward.get('wardId')))
            
            # Get patients currently in this ward's queue
            # Assuming patients have 'wardId' and 'queueStatus' fields
            patients = list(db.patients.find({
                "wardId": ward_id,
                "admissionTime": {"$gte": cutoff_date}
            }))
            
            # Build ward snapshot
            snapshot = {
                "wardId": ward_id,
                "name": ward.get("name", f"Ward {ward_id}"),
                "totalBeds": ward.get("totalBeds", 37),
                "occupiedBeds": len(patients),
                "queue": [],
                "timestamp": datetime.now(timezone.utc)
            }
            
            # Add patient details
            for patient in patients:
                snapshot["queue"].append({
                    "id": str(patient.get("_id")),
                    "name": patient.get("name", "Unknown"),
                    "priority": patient.get("priority", "Triage 5"),
                    "queueWaitTime": patient.get("queueWaitTime", 0),
                    "admissionTime": patient.get("admissionTime"),
                    "age": patient.get("age", 0),
                    "gender": patient.get("gender", "M")
                })
            
            snapshots.append(snapshot)
        
        logger.info(f"Constructed {len(snapshots)} ward snapshots")
    
    client.close()
    return snapshots


# ============================================================
# Expert Action Generation (using current model)
# ============================================================

class DummyModel:
    """Fallback expert policy when no model is available."""
    
    def __init__(self, state_dim=10, action_dim=99):
        self.state_dim = state_dim
        self.action_dim = action_dim
    
    def predict(self, state: np.ndarray) -> int:
        """Expert heuristic: prioritize based on queue state."""
        # Decode state
        occ = state[0]
        q_len = state[1]
        triage_dist = state[2:7]
        longest_wait = state[7]
        
        # Heuristic: if queue is long and has critical patients, weight triage heavily
        # If wait times are long, weight wait time more
        has_critical = triage_dist[0] > 0.2  # >20% critical patients
        long_wait = longest_wait > 0.5
        
        if has_critical and long_wait:
            action_idx = 50  # Balanced
        elif has_critical:
            action_idx = 20  # Low wait weight, high triage weight
        elif long_wait:
            action_idx = 80  # High wait weight, low triage weight
        else:
            action_idx = 50  # Balanced
        
        return min(action_idx, self.action_dim - 1)


def load_expert_model(model_path: str = None, state_dim: int = 10, action_dim: int = 99):
    """Load expert model or create dummy expert."""
    if model_path and Path(model_path).exists():
        logger.info(f"Loading expert model from {model_path}")
        try:
            from inference_service.queue_reorder_lib import load_model
            model, meta = load_model(model_path)
            logger.info(f"Loaded {meta['model_type']} model (state_dim={meta['state_dim']}, action_dim={meta['action_dim']})")
            return model, meta
        except Exception as e:
            logger.warning(f"Failed to load model: {e}. Using dummy expert.")
    
    logger.info("Using dummy expert policy (heuristic-based)")
    return DummyModel(state_dim, action_dim), {"state_dim": state_dim, "action_dim": action_dim}


def get_expert_action(model, state: np.ndarray, action_dim: int) -> int:
    """Get expert action from model."""
    if hasattr(model, 'predict'):
        return model.predict(state)
    
    # Neural network model
    state_tensor = torch.FloatTensor(state).unsqueeze(0)
    with torch.no_grad():
        q_values = model(state_tensor).squeeze(0).numpy()
    
    # Block action 0 (no-op)
    q_values[0] = -np.inf
    return int(np.argmax(q_values))


# ============================================================
# Main Data Generation
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='Generate training data from historical ward data')
    parser.add_argument('--days', type=int, default=7, help='Number of days of history to use')
    parser.add_argument('--output', type=str, default='mlops/data/processed', help='Output directory')
    parser.add_argument('--model', type=str, default=None, help='Path to expert model (optional)')
    parser.add_argument('--augment', type=int, default=1, help='Data augmentation factor')
    args = parser.parse_args()
    
    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Step 1: Collect historical ward snapshots
    snapshots = collect_historical_data(days=args.days)
    
    if not snapshots:
        logger.error("No historical data found. Please ensure MongoDB has patient/ward data.")
        return
    
    # Step 2: Load expert model
    model, meta = load_expert_model(args.model, state_dim=10, action_dim=99)
    state_dim = meta['state_dim']
    action_dim = meta['action_dim']
    
    # Step 3: Generate (state, action) pairs
    logger.info(f"Generating training samples (augmentation={args.augment})...")
    
    states = []
    actions = []
    
    for snapshot in snapshots:
        # Build state vector using the SAME function as inference
        payload = {
            "targetWardQueue": snapshot.get("queue", []),
            "targetWardTotalBeds": snapshot.get("totalBeds", 37),
            "targetWardOccupiedBeds": snapshot.get("occupiedBeds", 0),
        }
        
        base_state = build_training_state(payload, state_dim=state_dim)
        
        # Generate augmented samples with slight noise
        for _ in range(args.augment):
            # Add small noise to state for data augmentation
            noise = np.random.normal(0, 0.01, size=base_state.shape)
            noisy_state = np.clip(base_state + noise, 0.0, 1.0).astype(np.float32)
            
            # Get expert action
            action = get_expert_action(model, noisy_state, action_dim)
            
            states.append(noisy_state)
            actions.append(action)
    
    states = np.array(states, dtype=np.float32)
    actions = np.array(actions, dtype=np.int64)
    
    logger.info(f"Generated {len(states)} training samples")
    logger.info(f"State shape: {states.shape}, Action shape: {actions.shape}")
    logger.info(f"State range: [{states.min():.3f}, {states.max():.3f}]")
    logger.info(f"Action distribution: {np.bincount(actions, minlength=action_dim)}")
    
    # Step 4: Save processed data
    np.save(output_path / 'states.npy', states)
    np.save(output_path / 'actions.npy', actions)
    
    # Save metadata
    metadata = {
        'n_samples': len(states),
        'state_dim': int(state_dim),
        'action_dim': int(action_dim),
        'n_agents': 5,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'source': 'mongodb_historical',
        'days_collected': args.days,
        'augmentation': args.augment,
        'expert_model': str(args.model) if args.model else 'dummy_heuristic'
    }
    
    with open(output_path / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"✅ Saved training data to {output_path}")
    logger.info(f"   - states.npy: {states.shape}")
    logger.info(f"   - actions.npy: {actions.shape}")
    logger.info(f"   - metadata.json")


if __name__ == '__main__':
    main()