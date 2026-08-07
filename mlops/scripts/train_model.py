#!/usr/bin/env python3
"""
Train MAPPO model for hospital queue optimization.

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
# MAPPO Model Definitions
# ============================================================
class TriageActor(nn.Module):
    """Individual actor network for each triage agent."""
    
    def __init__(self, state_dim=10, n_actions=99, hidden_dims=(128, 128)):
        super().__init__()
        layers = []
        in_dim = state_dim
        
        for hidden in hidden_dims:
            layers.append(nn.Linear(in_dim, hidden))
            layers.append(nn.ReLU())
            in_dim = hidden
        
        layers.append(nn.Linear(in_dim, n_actions))
        self.net = nn.Sequential(*layers)
    
    def forward(self, x):
        return self.net(x)


class CentralizedCritic(nn.Module):
    """Centralized critic for value estimation."""
    
    def __init__(self, state_dim=10, hidden_dims=(128, 128)):
        super().__init__()
        layers = []
        in_dim = state_dim
        
        for hidden in hidden_dims:
            layers.append(nn.Linear(in_dim, hidden))
            layers.append(nn.ReLU())
            in_dim = hidden
        
        layers.append(nn.Linear(in_dim, 1))
        self.net = nn.Sequential(*layers)
    
    def forward(self, x):
        return self.net(x)


# ============================================================
# Training Utilities
# ============================================================
def load_config(config_path: str) -> dict:
    """Load training configuration."""
    with open(config_path, 'r') as f:
        return json.load(f)


def create_dummy_dataset(state_dim=10, n_actions=99, num_samples=1000):
    """Create dummy dataset for demonstration."""
    logger.info(f"Creating dummy dataset with {num_samples} samples...")
    
    # Random state vectors
    states = torch.randn(num_samples, state_dim)
    
    # Random action advantages (for policy gradient)
    advantages = torch.randn(num_samples)
    
    # Random returns (for value loss)
    returns = torch.randn(num_samples)
    
    dataset = TensorDataset(states, advantages, returns)
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
    
    return dataloader


def compute_gae(rewards, values, gamma=0.99, lam=0.95):
    """Compute Generalized Advantage Estimation."""
    advantages = []
    gae = 0
    
    for t in reversed(range(len(rewards))):
        if t == len(rewards) - 1:
            next_value = 0
        else:
            next_value = values[t + 1]
        
        delta = rewards[t] + gamma * next_value - values[t]
        gae = delta + gamma * lam * gae
        advantages.insert(0, gae)
    
    return torch.tensor(advantages)


def train_epoch(actors, critic, dataloader, optimizers, critic_optimizer, 
                device, clip_epsilon=0.2):
    """Train one epoch of MAPPO."""
    for actor in actors:
        actor.train()
    critic.train()
    
    total_policy_loss = 0.0
    total_value_loss = 0.0
    total_entropy = 0.0
    num_batches = 0
    
    for batch_idx, (states, advantages, returns) in enumerate(dataloader):
        states = states.to(device)
        advantages = advantages.to(device)
        returns = returns.to(device)
        
        # Normalize advantages
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
        
        # Update critic
        critic_optimizer.zero_grad()
        values = critic(states).squeeze()
        value_loss = nn.MSELoss()(values, returns)
        value_loss.backward()
        nn.utils.clip_grad_norm_(critic.parameters(), max_norm=0.5)
        critic_optimizer.step()
        
        # Update each actor
        for i, (actor, optimizer) in enumerate(zip(actors, optimizers)):
            optimizer.zero_grad()
            
            # Get action logits
            logits = actor(states)
            dist = torch.distributions.Categorical(logits=logits)
            
            # Get actions and log probs
            actions = dist.sample()
            log_probs = dist.log_prob(actions)
            
            # Policy gradient loss (simplified - in real MAPPO you'd have old log probs)
            policy_loss = -(log_probs * advantages.detach()).mean()
            
            # Entropy bonus for exploration
            entropy = dist.entropy().mean()
            entropy_bonus = 0.01 * entropy
            
            loss = policy_loss - entropy_bonus
            loss.backward()
            nn.utils.clip_grad_norm_(actor.parameters(), max_norm=0.5)
            optimizer.step()
            
            total_policy_loss += policy_loss.item()
            total_entropy += entropy.item()
        
        total_value_loss += value_loss.item()
        num_batches += 1
    
    avg_policy_loss = total_policy_loss / (num_batches * len(actors))
    avg_value_loss = total_value_loss / num_batches
    avg_entropy = total_entropy / (num_batches * len(actors))
    
    return avg_policy_loss, avg_value_loss, avg_entropy


def validate(actors, critic, dataloader, device):
    """Validate model."""
    for actor in actors:
        actor.eval()
    critic.eval()
    
    total_loss = 0.0
    num_batches = 0
    
    with torch.no_grad():
        for states, _, returns in dataloader:
            states = states.to(device)
            returns = returns.to(device)
            
            values = critic(states).squeeze()
            loss = nn.MSELoss()(values, returns)
            total_loss += loss.item()
            num_batches += 1
    
    avg_loss = total_loss / num_batches
    return avg_loss


def main():
    parser = argparse.ArgumentParser(description='Train MAPPO model')
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
    
    # Create MAPPO model (5 actors + 1 critic)
    logger.info("Creating MAPPO model...")
    n_agents = arch['n_agents']
    state_dim = arch['state_dim']
    action_dim = arch['action_dim']
    hidden_dims = tuple(arch['hidden_dims'])
    
    actors = [TriageActor(state_dim, action_dim, hidden_dims).to(args.device) 
              for _ in range(n_agents)]
    critic = CentralizedCritic(state_dim, hidden_dims).to(args.device)
    
    # Setup optimizers (one per actor + one for critic)
    actor_optimizers = [
        optim.Adam(actor.parameters(), 
                  lr=optimizer_config['learning_rate'],
                  betas=(optimizer_config['beta1'], optimizer_config['beta2']),
                  eps=optimizer_config['epsilon'],
                  weight_decay=optimizer_config['weight_decay'])
        for actor in actors
    ]
    critic_optimizer = optim.Adam(critic.parameters(),
                                  lr=optimizer_config['learning_rate'],
                                  betas=(optimizer_config['beta1'], optimizer_config['beta2']),
                                  eps=optimizer_config['epsilon'],
                                  weight_decay=optimizer_config['weight_decay'])
    
    # Create datasets
    logger.info("Loading training data...")
    train_dataloader = create_dummy_dataset(
        state_dim=state_dim,
        n_actions=action_dim,
        num_samples=1000
    )
    
    val_dataloader = create_dummy_dataset(
        state_dim=state_dim,
        n_actions=action_dim,
        num_samples=200
    )
    
    # Training loop
    logger.info(f"Starting training for {training_config['epochs']} epochs...")
    best_val_loss = float('inf')
    patience_counter = 0
    patience = config['early_stopping']['patience']
    
    training_history = {
        'train_policy_losses': [],
        'train_value_losses': [],
        'train_entropies': [],
        'val_losses': [],
        'epochs': []
    }
    
    for epoch in range(training_config['epochs']):
        train_policy_loss, train_value_loss, train_entropy = train_epoch(
            actors, critic, train_dataloader, actor_optimizers, critic_optimizer,
            args.device
        )
        val_loss = validate(actors, critic, val_dataloader, args.device)
        
        training_history['epochs'].append(epoch + 1)
        training_history['train_policy_losses'].append(train_policy_loss)
        training_history['train_value_losses'].append(train_value_loss)
        training_history['train_entropies'].append(train_entropy)
        training_history['val_losses'].append(val_loss)
        
        logger.info(f"Epoch {epoch+1}/{training_config['epochs']} - "
                   f"Policy Loss: {train_policy_loss:.6f}, "
                   f"Value Loss: {train_value_loss:.6f}, "
                   f"Entropy: {train_entropy:.6f}, "
                   f"Val Loss: {val_loss:.6f}")
        
        # Save checkpoint
        if (epoch + 1) % config['model_checkpoint']['save_every_epochs'] == 0:
            checkpoint_path = output_path / f"checkpoint_epoch_{epoch+1}.pth"
            checkpoint = {
                'actor_0': actors[0].state_dict(),
                'actor_1': actors[1].state_dict(),
                'actor_2': actors[2].state_dict(),
                'actor_3': actors[3].state_dict(),
                'actor_4': actors[4].state_dict(),
                'critic': critic.state_dict(),
            }
            torch.save(checkpoint, checkpoint_path)
            logger.info(f"Saved checkpoint to {checkpoint_path}")
        
        # Early stopping
        if val_loss < best_val_loss - config['early_stopping']['min_delta']:
            best_val_loss = val_loss
            patience_counter = 0
            
            # Save best model
            best_model_path = output_path / "model.pth"
            checkpoint = {
                'actor_0': actors[0].state_dict(),
                'actor_1': actors[1].state_dict(),
                'actor_2': actors[2].state_dict(),
                'actor_3': actors[3].state_dict(),
                'actor_4': actors[4].state_dict(),
                'critic': critic.state_dict(),
            }
            torch.save(checkpoint, best_model_path)
            logger.info(f"Best model updated: {best_model_path}")
        else:
            patience_counter += 1
            if patience_counter >= patience and config['early_stopping']['enabled']:
                logger.info(f"Early stopping at epoch {epoch+1}")
                break
    
    # Save final model and training info
    logger.info("Saving final model and metadata...")
    final_model_path = output_path / "model.pth"
    checkpoint = {
        'actor_0': actors[0].state_dict(),
        'actor_1': actors[1].state_dict(),
        'actor_2': actors[2].state_dict(),
        'actor_3': actors[3].state_dict(),
        'actor_4': actors[4].state_dict(),
        'critic': critic.state_dict(),
    }
    torch.save(checkpoint, final_model_path)
    
    with open(output_path / "training_history.json", 'w') as f:
        json.dump(training_history, f, indent=2)
    
    # Create metadata
    metadata = {
        "model": "MAPPO",
        "version": "1.0",
        "trained_at": datetime.now().isoformat(),
        "epochs_trained": len(training_history['epochs']),
        "final_train_policy_loss": float(training_history['train_policy_losses'][-1]),
        "final_train_value_loss": float(training_history['train_value_losses'][-1]),
        "final_train_entropy": float(training_history['train_entropies'][-1]),
        "final_val_loss": float(training_history['val_losses'][-1]),
        "best_val_loss": float(best_val_loss),
        "architecture": arch,
        "training_config": training_config,
        "optimizer_config": optimizer_config,
        "n_agents": n_agents,
        "agent_names": arch['agent_names'],
        "alpha_weights": arch['alpha_weights']
    }
    
    with open(output_path / "metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"Training completed! Model saved to {output_path}")


if __name__ == '__main__':
    main()