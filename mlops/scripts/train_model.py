#!/usr/bin/env python3
"""
Train DDQN model for hospital queue optimization.

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


class DDQN(nn.Module):
    """Double Deep Q-Network model."""
    
    def __init__(self, state_dim: int = 16, action_dim: int = 81, 
                 hidden_dims: tuple = (128, 128), dropout_rate: float = 0.2):
        super().__init__()
        
        layers = []
        in_dim = state_dim
        
        for hidden in hidden_dims:
            layers.append(nn.Linear(in_dim, hidden))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(dropout_rate))
            in_dim = hidden
        
        layers.append(nn.Linear(in_dim, action_dim))
        
        self.net = nn.Sequential(*layers)
        self.state_dim = state_dim
        self.action_dim = action_dim
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def load_config(config_path: str) -> dict:
    """Load training configuration."""
    with open(config_path, 'r') as f:
        return json.load(f)


def create_dummy_dataset(state_dim: int = 16, action_dim: int = 81, 
                        num_samples: int = 1000) -> DataLoader:
    """Create dummy dataset for demonstration."""
    logger.info(f"Creating dummy dataset with {num_samples} samples...")
    
    # Random state vectors
    X = torch.randn(num_samples, state_dim)
    
    # Random target Q-values
    y = torch.randn(num_samples, action_dim)
    
    dataset = TensorDataset(X, y)
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
    
    return dataloader


def train_epoch(model: DDQN, dataloader: DataLoader, optimizer: optim.Optimizer, 
                criterion: nn.Module, device: str) -> float:
    """Train one epoch."""
    model.train()
    total_loss = 0.0
    
    for batch_idx, (states, targets) in enumerate(dataloader):
        states = states.to(device)
        targets = targets.to(device)
        
        optimizer.zero_grad()
        predictions = model(states)
        loss = criterion(predictions, targets)
        loss.backward()
        
        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        
        optimizer.step()
        total_loss += loss.item()
    
    avg_loss = total_loss / len(dataloader)
    return avg_loss


def validate(model: DDQN, dataloader: DataLoader, criterion: nn.Module, 
             device: str) -> float:
    """Validate model."""
    model.eval()
    total_loss = 0.0
    
    with torch.no_grad():
        for states, targets in dataloader:
            states = states.to(device)
            targets = targets.to(device)
            
            predictions = model(states)
            loss = criterion(predictions, targets)
            total_loss += loss.item()
    
    avg_loss = total_loss / len(dataloader)
    return avg_loss


def main():
    parser = argparse.ArgumentParser(description='Train DDQN model')
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
    
    # Create model
    logger.info("Creating DDQN model...")
    model = DDQN(
        state_dim=arch['state_dim'],
        action_dim=arch['action_dim'],
        hidden_dims=tuple(arch['hidden_dims']),
        dropout_rate=config['regularization']['dropout_rate']
    )
    model.to(args.device)
    
    # Setup optimizer and loss
    optimizer = optim.Adam(
        model.parameters(),
        lr=optimizer_config['learning_rate'],
        betas=(optimizer_config['beta1'], optimizer_config['beta2']),
        eps=optimizer_config['epsilon'],
        weight_decay=optimizer_config['weight_decay']
    )
    criterion = nn.MSELoss()
    
    # Create datasets
    logger.info("Loading training data...")
    train_dataloader = create_dummy_dataset(
        state_dim=arch['state_dim'],
        action_dim=arch['action_dim'],
        num_samples=1000
    )
    
    val_dataloader = create_dummy_dataset(
        state_dim=arch['state_dim'],
        action_dim=arch['action_dim'],
        num_samples=200
    )
    
    # Training loop
    logger.info(f"Starting training for {training_config['epochs']} epochs...")
    best_val_loss = float('inf')
    patience_counter = 0
    patience = config['early_stopping']['patience']
    
    training_history = {
        'train_losses': [],
        'val_losses': [],
        'epochs': []
    }
    
    for epoch in range(training_config['epochs']):
        train_loss = train_epoch(model, train_dataloader, optimizer, criterion, args.device)
        val_loss = validate(model, val_dataloader, criterion, args.device)
        
        training_history['epochs'].append(epoch + 1)
        training_history['train_losses'].append(train_loss)
        training_history['val_losses'].append(val_loss)
        
        logger.info(f"Epoch {epoch+1}/{training_config['epochs']} - "
                   f"Train Loss: {train_loss:.6f}, Val Loss: {val_loss:.6f}")
        
        # Save checkpoint
        if (epoch + 1) % config['model_checkpoint']['save_every_epochs'] == 0:
            checkpoint_path = output_path / f"checkpoint_epoch_{epoch+1}.pth"
            torch.save(model.state_dict(), checkpoint_path)
            logger.info(f"Saved checkpoint to {checkpoint_path}")
        
        # Early stopping
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
    torch.save(model.state_dict(), output_path / "model.pth")
    
    with open(output_path / "training_history.json", 'w') as f:
        json.dump(training_history, f, indent=2)
    
    # Create metadata
    metadata = {
        "model": "DDQN",
        "version": "1.0",
        "trained_at": datetime.now().isoformat(),
        "epochs_trained": len(training_history['epochs']),
        "final_train_loss": float(training_history['train_losses'][-1]),
        "final_val_loss": float(training_history['val_losses'][-1]),
        "best_val_loss": float(best_val_loss),
        "architecture": arch,
        "training_config": training_config,
        "optimizer_config": optimizer_config
    }
    
    with open(output_path / "metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"Training completed! Model saved to {output_path}")


if __name__ == '__main__':
    main()
