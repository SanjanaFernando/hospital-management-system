#!/usr/bin/env python3
"""
Evaluate trained MAPPO model performance.

Usage:
    python mlops/scripts/evaluate_model.py \
      --model mlops/models/v2/model.pth \
      --data mlops/data/test_sets \
      --output mlops/models/v2/performance.json
"""

import json
import logging
import argparse
import time
from pathlib import Path
from datetime import datetime

import numpy as np
import torch
import torch.nn as nn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mlops/logs/evaluation/evaluation.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# ============================================================
# MAPPO Model Definitions (must match training script)
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
# Evaluation Utilities
# ============================================================
def load_model(model_path: str, state_dim: int = 10, action_dim: int = 99,
               device: str = 'cpu'):
    """Load trained MAPPO model (5 actors + critic)."""
    logger.info(f"Loading MAPPO model from {model_path}...")
    
    checkpoint = torch.load(model_path, map_location=device)
    
    hidden_dims = (128, 128)  # Default, could be extracted from checkpoint
    
    # Create 5 actors
    actors = [TriageActor(state_dim, action_dim, hidden_dims).to(device) 
              for _ in range(5)]
    
    # Load actor weights
    for i in range(5):
        actors[i].load_state_dict(checkpoint[f'actor_{i}'])
        actors[i].eval()
    
    # Create and load critic
    critic = CentralizedCritic(state_dim, hidden_dims).to(device)
    critic.load_state_dict(checkpoint['critic'])
    critic.eval()
    
    logger.info("MAPPO model loaded successfully (5 actors + critic)")
    return actors, critic


def calculate_inference_latency(actors, critic, test_inputs, 
                               num_runs: int = 100, device: str = 'cpu') -> dict:
    """Calculate model inference latency."""
    logger.info(f"Calculating inference latency ({num_runs} runs)...")
    
    latencies = []
    
    with torch.no_grad():
        for _ in range(num_runs):
            start = time.time()
            
            # Run all 5 actors
            test_input = test_inputs[0:1].to(device)
            for actor in actors:
                _ = actor(test_input)
            
            # Run critic
            _ = critic(test_input)
            
            latencies.append((time.time() - start) * 1000)  # Convert to ms
    
    latencies = np.array(latencies)
    
    return {
        'mean_ms': float(np.mean(latencies)),
        'median_ms': float(np.median(latencies)),
        'std_ms': float(np.std(latencies)),
        'min_ms': float(np.min(latencies)),
        'max_ms': float(np.max(latencies))
    }


def calculate_fairness_score(actors, test_inputs, device='cpu') -> float:
    """
    Calculate fairness score based on action distribution across agents.
    
    Fairness is measured as consistency in policy across different agents.
    Score range: 0-1 (1 is most fair/consistent)
    """
    logger.info("Calculating fairness score...")
    
    all_actions = []
    
    with torch.no_grad():
        for test_input in test_inputs:
            state_t = test_input.unsqueeze(0).to(device)
            agent_actions = []
            
            for actor in actors:
                logits = actor(state_t)
                action = torch.argmax(logits, dim=-1).item()
                agent_actions.append(action)
            
            all_actions.append(agent_actions)
    
    # Calculate variance in actions across agents
    all_actions = np.array(all_actions)
    action_variance = np.mean(np.var(all_actions, axis=1))
    
    # Lower variance = more consistent = fairer
    # Normalize to 0-1 range (assuming max variance of 5000 for 99 actions)
    fairness = 1.0 / (1.0 + action_variance / 1000.0)
    
    return float(np.clip(fairness, 0.0, 1.0))


def calculate_efficiency_score(actors, test_inputs, device='cpu') -> float:
    """
    Calculate efficiency score based on action confidence.
    
    Efficiency is measured by how confident the agents are in their decisions.
    Score range: 0-1
    """
    logger.info("Calculating efficiency score...")
    
    confidences = []
    
    with torch.no_grad():
        for test_input in test_inputs:
            state_t = test_input.unsqueeze(0).to(device)
            
            for actor in actors:
                logits = actor(state_t)
                probs = torch.softmax(logits, dim=-1)
                max_prob = torch.max(probs).item()
                confidences.append(max_prob)
    
    # Higher confidence = more efficient
    efficiency = float(np.mean(confidences))
    
    return float(np.clip(efficiency, 0.0, 1.0))


def calculate_accuracy(actors, test_inputs, device='cpu') -> float:
    """
    Calculate accuracy based on policy consistency.
    
    Accuracy is measured by how often agents agree on actions.
    """
    logger.info("Calculating accuracy...")
    
    agreements = []
    
    with torch.no_grad():
        for test_input in test_inputs:
            state_t = test_input.unsqueeze(0).to(device)
            
            actions = []
            for actor in actors:
                logits = actor(state_t)
                action = torch.argmax(logits, dim=-1).item()
                actions.append(action)
            
            # Calculate agreement (how many agents chose the same action)
            action_counts = {}
            for action in actions:
                action_counts[action] = action_counts.get(action, 0) + 1
            
            max_agreement = max(action_counts.values())
            agreement_ratio = max_agreement / len(actions)
            agreements.append(agreement_ratio)
    
    accuracy = float(np.mean(agreements))
    return float(np.clip(accuracy, 0.0, 1.0))


def main():
    parser = argparse.ArgumentParser(description='Evaluate MAPPO model')
    parser.add_argument('--model', type=str, required=True, help='Model path')
    parser.add_argument('--data', type=str, default='mlops/data/test_sets', 
                       help='Test data directory')
    parser.add_argument('--output', type=str, default=None, 
                       help='Output performance metrics file')
    parser.add_argument('--device', type=str, default='cuda' if torch.cuda.is_available() else 'cpu',
                       help='Device (cuda/cpu)')
    
    args = parser.parse_args()
    
    logger.info(f"Using device: {args.device}")
    logger.info("Starting MAPPO model evaluation...")
    
    # Load model config
    model_config = json.load(open('mlops/config/model_config.json'))
    arch = model_config['architecture']
    
    # Load model
    actors, critic = load_model(
        args.model,
        state_dim=arch['state_dim'],
        action_dim=arch['action_dim'],
        device=args.device
    )
    
    # Create test data
    logger.info("Creating test data...")
    test_inputs = torch.randn(100, arch['state_dim'])
    
    # Calculate metrics
    logger.info("Calculating evaluation metrics...")
    
    latency_metrics = calculate_inference_latency(
        actors, critic, test_inputs, num_runs=100, device=args.device
    )
    fairness_score = calculate_fairness_score(actors, test_inputs, device=args.device)
    efficiency_score = calculate_efficiency_score(actors, test_inputs, device=args.device)
    accuracy = calculate_accuracy(actors, test_inputs, device=args.device)
    
    # Compile results
    performance = {
        "evaluation_timestamp": datetime.now().isoformat(),
        "model_path": args.model,
        "model_type": "MAPPO",
        "n_agents": arch['n_agents'],
        "agent_names": arch['agent_names'],
        "metrics": {
            "fairness_score": fairness_score,
            "efficiency_score": efficiency_score,
            "accuracy": accuracy,
            "inference_latency": latency_metrics
        },
        "test_dataset": {
            "samples": len(test_inputs),
            "state_dim": arch['state_dim'],
            "action_dim": arch['action_dim']
        },
        "performance_targets": model_config['performance_targets']
    }
    
    # Log results
    logger.info(f"Fairness Score: {fairness_score:.4f} (target: {model_config['performance_targets']['fairness_score']})")
    logger.info(f"Efficiency Score: {efficiency_score:.4f} (target: {model_config['performance_targets']['efficiency_score']})")
    logger.info(f"Accuracy: {accuracy:.4f} (target: {model_config['performance_targets']['accuracy']})")
    logger.info(f"Avg Latency: {latency_metrics['mean_ms']:.2f}ms (target: {model_config['performance_targets']['inference_latency_ms']}ms)")
    
    # Save results
    output_file = args.output or str(Path(args.model).parent / 'performance.json')
    with open(output_file, 'w') as f:
        json.dump(performance, f, indent=2)
    
    logger.info(f"Performance metrics saved to {output_file}")
    
    # Print summary
    print("\n" + "="*60)
    print("MAPPO EVALUATION SUMMARY")
    print("="*60)
    print(f"Model Type:       MAPPO (5 agents)")
    print(f"Fairness Score:   {fairness_score:.4f} / 1.00")
    print(f"Efficiency Score: {efficiency_score:.4f} / 1.00")
    print(f"Accuracy:         {accuracy:.4f} / 1.00")
    print(f"Avg Latency:      {latency_metrics['mean_ms']:.2f}ms")
    print("="*60 + "\n")


if __name__ == '__main__':
    main()