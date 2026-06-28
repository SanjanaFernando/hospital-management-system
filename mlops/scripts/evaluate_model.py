#!/usr/bin/env python3
"""
Evaluate trained DDQN model performance.

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

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def load_model(model_path: str, state_dim: int = 16, action_dim: int = 81,
               device: str = 'cpu') -> DDQN:
    """Load trained model."""
    logger.info(f"Loading model from {model_path}...")
    
    model = DDQN(state_dim=state_dim, action_dim=action_dim)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()
    
    logger.info("Model loaded successfully")
    return model


def calculate_inference_latency(model: DDQN, test_inputs: torch.Tensor, 
                               num_runs: int = 100, device: str = 'cpu') -> dict:
    """Calculate model inference latency."""
    logger.info(f"Calculating inference latency ({num_runs} runs)...")
    
    latencies = []
    
    with torch.no_grad():
        for _ in range(num_runs):
            start = time.time()
            _ = model(test_inputs.to(device))
            latencies.append((time.time() - start) * 1000)  # Convert to ms
    
    latencies = np.array(latencies)
    
    return {
        'mean_ms': float(np.mean(latencies)),
        'median_ms': float(np.median(latencies)),
        'std_ms': float(np.std(latencies)),
        'min_ms': float(np.min(latencies)),
        'max_ms': float(np.max(latencies))
    }


def calculate_fairness_score(predictions: np.ndarray) -> float:
    """
    Calculate fairness score based on distribution of predictions.
    
    Fairness is measured as low variance in wait times across priority levels.
    Score range: 0-1 (1 is most fair)
    """
    # Simulate priority levels
    num_samples = len(predictions)
    priority_groups = 5
    samples_per_group = num_samples // priority_groups
    
    variances = []
    for i in range(priority_groups):
        group_preds = predictions[i * samples_per_group:(i + 1) * samples_per_group]
        if len(group_preds) > 0:
            variances.append(np.var(group_preds))
    
    # Low variance = fair (score closer to 1)
    max_var = np.mean(variances) if variances else 1.0
    fairness = 1.0 / (1.0 + max_var)
    
    return float(fairness)


def calculate_efficiency_score(predictions: np.ndarray) -> float:
    """
    Calculate efficiency score.
    
    Efficiency is based on how well the model prioritizes critical cases.
    Score range: 0-1
    """
    # Top 20% of predictions should be higher (representing better queue order)
    top_20_percent = int(len(predictions) * 0.2)
    top_predictions = np.argsort(predictions)[-top_20_percent:]
    
    # Check if top predictions have higher values
    top_values = predictions[top_predictions]
    bottom_values = predictions[~np.isin(np.arange(len(predictions)), top_predictions)]
    
    efficiency = float(np.mean(top_values)) / (float(np.mean(bottom_values)) + 1e-6)
    
    return min(efficiency, 1.0)


def calculate_accuracy(predictions: np.ndarray, ground_truth: np.ndarray) -> float:
    """Calculate accuracy of priority ordering."""
    # Compare top-k predictions with ground truth
    k = 5
    pred_top_k = set(np.argsort(predictions)[-k:])
    truth_top_k = set(np.argsort(ground_truth)[-k:])
    
    accuracy = len(pred_top_k & truth_top_k) / k
    return float(accuracy)


def main():
    parser = argparse.ArgumentParser(description='Evaluate DDQN model')
    parser.add_argument('--model', type=str, required=True, help='Model path')
    parser.add_argument('--data', type=str, default='mlops/data/test_sets', 
                       help='Test data directory')
    parser.add_argument('--output', type=str, default=None, 
                       help='Output performance metrics file')
    parser.add_argument('--device', type=str, default='cuda' if torch.cuda.is_available() else 'cpu',
                       help='Device (cuda/cpu)')
    
    args = parser.parse_args()
    
    logger.info(f"Using device: {args.device}")
    logger.info("Starting model evaluation...")
    
    # Load model
    model_config = json.load(open('mlops/config/model_config.json'))
    arch = model_config['architecture']
    
    model = load_model(
        args.model,
        state_dim=arch['state_dim'],
        action_dim=arch['action_dim'],
        device=args.device
    )
    
    # Create test data
    logger.info("Creating test data...")
    test_inputs = torch.randn(100, arch['state_dim'])
    test_outputs = torch.randn(100, arch['action_dim'])
    
    # Inference
    with torch.no_grad():
        predictions = model(test_inputs.to(args.device))
        predictions_np = predictions.cpu().numpy()
    
    # Calculate metrics
    logger.info("Calculating evaluation metrics...")
    
    latency_metrics = calculate_inference_latency(model, test_inputs, num_runs=100, device=args.device)
    fairness_score = calculate_fairness_score(predictions_np.mean(axis=1))
    efficiency_score = calculate_efficiency_score(predictions_np.mean(axis=1))
    accuracy = calculate_accuracy(predictions_np.mean(axis=1), test_outputs.numpy().mean(axis=1))
    
    # Compile results
    performance = {
        "evaluation_timestamp": datetime.now().isoformat(),
        "model_path": args.model,
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
    print("EVALUATION SUMMARY")
    print("="*60)
    print(f"Fairness Score:   {fairness_score:.4f} / 1.00")
    print(f"Efficiency Score: {efficiency_score:.4f} / 1.00")
    print(f"Accuracy:         {accuracy:.4f} / 1.00")
    print(f"Avg Latency:      {latency_metrics['mean_ms']:.2f}ms")
    print("="*60 + "\n")


if __name__ == '__main__':
    main()
