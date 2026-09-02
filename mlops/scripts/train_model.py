#!/usr/bin/env python3
"""
Train the shared MAPPO actor for hospital queue optimization.

This trains a single shared actor (matching the production architecture used
by inference-service/queue_reorder_lib.py and mlops/scripts/evaluate_model.py):
    17 -> 256 -> 256 -> 128 -> 25, Tanh activations, raw logits output.

The checkpoint is saved as a raw state_dict with keys net.0 / net.2 / net.4 / net.6
so it loads directly in evaluate_model.py and the production inference loader.

Usage:
    python mlops/scripts/train_model.py \
      --data mlops/data/processed \
      --config mlops/config/training_config.json \
      --output mlops/models/v2
"""

import json
import logging
import argparse
from pathlib import Path
from datetime import datetime

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mlops/logs/training/training.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# ============================================================
# Model Definition — must exactly match evaluate_model.py / queue_reorder_lib.py
# ============================================================
class MAPPOActor(nn.Module):
    """Single shared actor — matches the production checkpoint architecture."""

    def __init__(self, state_dim: int = 17, n_actions: int = 25):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 256), nn.Tanh(),
            nn.Linear(256, 256), nn.Tanh(),
            nn.Linear(256, 128), nn.Tanh(),
            nn.Linear(128, n_actions),
        )

    def forward(self, x):
        return self.net(x)


# ============================================================
# Training Utilities
# ============================================================
def load_config(config_path: str) -> dict:
    """Load training configuration."""
    with open(config_path, 'r') as f:
        return json.load(f)


def load_training_data(data_dir: str, batch_size: int = 32, val_split: float = 0.2):
    """Load preprocessed training data from .npy files.

    Args:
        data_dir: Directory containing states.npy and actions.npy
        batch_size: Training batch size
        val_split: Fraction of data to use for validation

    Returns:
        (train_dataloader, val_dataloader)
    """
    data_path = Path(data_dir)

    states_file = data_path / 'states.npy'
    actions_file = data_path / 'actions.npy'

    if not states_file.exists() or not actions_file.exists():
        raise FileNotFoundError(
            f"Training data not found in {data_dir}. "
            f"Run generate_training_data.py first."
        )

    logger.info(f"Loading training data from {data_dir}...")
    states = np.load(states_file)
    actions = np.load(actions_file)

    logger.info(f"Loaded {len(states)} samples")
    logger.info(f"State shape: {states.shape}, Action shape: {actions.shape}")

    n_samples = len(states)
    n_val = int(n_samples * val_split)
    if n_val == 0 and n_samples >= 2:
        n_val = 1  # guarantee at least one val sample when possible
    n_train = n_samples - n_val

    # Shuffle before splitting
    indices = np.random.permutation(n_samples)
    train_indices = indices[:n_train]
    val_indices = indices[n_train:]

    train_states = torch.FloatTensor(states[train_indices])
    train_actions = torch.LongTensor(actions[train_indices])

    val_states = torch.FloatTensor(states[val_indices])
    val_actions = torch.LongTensor(actions[val_indices])

    train_dataset = TensorDataset(train_states, train_actions)
    val_dataset = TensorDataset(val_states, val_actions)

    train_dataloader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_dataloader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    logger.info(f"Train samples: {n_train}, Val samples: {n_val}")

    return train_dataloader, val_dataloader


def train_epoch(model, dataloader, optimizer, device):
    """Train one epoch: supervised imitation of expert actions."""
    model.train()

    total_loss = 0.0
    total_entropy = 0.0
    num_batches = 0

    for states, expert_actions in dataloader:
        states = states.to(device)
        expert_actions = expert_actions.to(device)

        optimizer.zero_grad()

        logits = model(states)
        dist = torch.distributions.Categorical(logits=logits)

        log_probs = dist.log_prob(expert_actions)
        policy_loss = -log_probs.mean()

        entropy = dist.entropy().mean()
        entropy_bonus = 0.01 * entropy

        loss = policy_loss - entropy_bonus
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=0.5)
        optimizer.step()

        total_loss += policy_loss.item()
        total_entropy += entropy.item()
        num_batches += 1

    avg_loss = total_loss / num_batches if num_batches > 0 else 0.0
    avg_entropy = total_entropy / num_batches if num_batches > 0 else 0.0

    return avg_loss, avg_entropy


def validate(model, dataloader, device):
    """Validate model on held-out expert actions."""
    model.eval()

    total_loss = 0.0
    num_batches = 0

    with torch.no_grad():
        for states, expert_actions in dataloader:
            states = states.to(device)
            expert_actions = expert_actions.to(device)

            logits = model(states)
            dist = torch.distributions.Categorical(logits=logits)
            log_probs = dist.log_prob(expert_actions)
            policy_loss = -log_probs.mean()

            total_loss += policy_loss.item()
            num_batches += 1

    avg_loss = total_loss / num_batches if num_batches > 0 else 0.0
    return avg_loss


def main():
    parser = argparse.ArgumentParser(description='Train shared MAPPO actor')
    parser.add_argument('--data', type=str, default='mlops/data/processed',
                       help='Data directory')
    parser.add_argument('--config', type=str, default='mlops/config/training_config.json',
                       help='Training config path')
    parser.add_argument('--output', type=str, default='mlops/models/v1',
                       help='Output model directory')
    parser.add_argument('--device', type=str, default='cuda' if torch.cuda.is_available() else 'cpu',
                       help='Device (cuda/cpu)')

    args = parser.parse_args()

    logger.info(f"Using device: {args.device}")

    # Load config
    config = load_config(args.config)
    training_config = config['training']
    optimizer_config = config['optimizer']
    model_config = json.load(open('mlops/config/model_config.json'))
    arch = model_config['architecture']

    # Create output directory
    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)

    # Create shared MAPPO actor
    logger.info("Creating shared MAPPO actor...")
    state_dim = arch['state_dim']
    action_dim = arch['action_dim']

    model = MAPPOActor(state_dim=state_dim, n_actions=action_dim).to(args.device)

    optimizer = optim.Adam(
        model.parameters(),
        lr=optimizer_config['learning_rate'],
        betas=(optimizer_config['beta1'], optimizer_config['beta2']),
        eps=optimizer_config['epsilon'],
        weight_decay=optimizer_config['weight_decay'],
    )

    # Load real training data
    logger.info("Loading training data...")
    try:
        train_dataloader, val_dataloader = load_training_data(
            data_dir=args.data,
            batch_size=training_config.get('batch_size', 32),
            val_split=0.2
        )
    except FileNotFoundError as e:
        logger.error(f"Training data missing: {e}")
        logger.error("Please run: python mlops/scripts/generate_training_data.py --days 7")
        return

    # Training loop
    logger.info(f"Starting training for {training_config['epochs']} epochs...")
    best_val_loss = float('inf')
    patience_counter = 0
    patience = config['early_stopping']['patience']

    training_history = {
        'train_losses': [],
        'train_entropies': [],
        'val_losses': [],
        'epochs': []
    }

    for epoch in range(training_config['epochs']):
        train_loss, train_entropy = train_epoch(model, train_dataloader, optimizer, args.device)
        val_loss = validate(model, val_dataloader, args.device)

        training_history['epochs'].append(epoch + 1)
        training_history['train_losses'].append(train_loss)
        training_history['train_entropies'].append(train_entropy)
        training_history['val_losses'].append(val_loss)

        logger.info(f"Epoch {epoch+1}/{training_config['epochs']} - "
                   f"Loss: {train_loss:.6f}, "
                   f"Entropy: {train_entropy:.6f}, "
                   f"Val Loss: {val_loss:.6f}")

        # Save checkpoint
        if (epoch + 1) % config['model_checkpoint']['save_every_epochs'] == 0:
            checkpoint_path = output_path / f"checkpoint_epoch_{epoch+1}.pth"
            torch.save(model.state_dict(), checkpoint_path)
            logger.info(f"Saved checkpoint to {checkpoint_path}")

        # Early stopping / best model tracking
        if val_loss < best_val_loss - config['early_stopping']['min_delta']:
            best_val_loss = val_loss
            patience_counter = 0

            best_model_path = output_path / "model.pth"
            torch.save(model.state_dict(), best_model_path)
            logger.info(f"Best model updated: {best_model_path}")
        else:
            patience_counter += 1
            if patience_counter >= patience and config['early_stopping']['enabled']:
                logger.info(f"Early stopping at epoch {epoch+1}")
                break

    # Save final model and training info
    logger.info("Saving final model and metadata...")
    final_model_path = output_path / "model.pth"
    torch.save(model.state_dict(), final_model_path)

    with open(output_path / "training_history.json", 'w') as f:
        json.dump(training_history, f, indent=2)

    # Create metadata
    metadata = {
        "model": "MAPPO_shared_actor",
        "version": "2.0",
        "trained_at": datetime.now().isoformat(),
        "epochs_trained": len(training_history['epochs']),
        "final_train_loss": float(training_history['train_losses'][-1]),
        "final_train_entropy": float(training_history['train_entropies'][-1]),
        "final_val_loss": float(training_history['val_losses'][-1]),
        "best_val_loss": float(best_val_loss),
        "architecture": arch,
        "training_config": training_config,
        "optimizer_config": optimizer_config,
    }

    with open(output_path / "metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)

    logger.info(f"Training completed! Model saved to {output_path}")


if __name__ == '__main__':
    main()