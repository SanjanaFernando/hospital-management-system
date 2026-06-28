# MLOps Model Storage

This directory contains versioned DDQN models for hospital queue optimization.

## Directory Structure

```
models/
├── v1/
│   ├── model.pth              # PyTorch model weights
│   ├── metadata.json          # Training info
│   ├── performance.json       # Evaluation metrics
│   ├── checkpoint_epoch_5.pth # Checkpoint
│   └── training_history.json  # Loss curves
├── v2/
├── v3/
├── active_version.json        # Currently active model
└── README.md                  # This file
```

## Active Model Configuration

The `active_version.json` file determines which model is loaded:

```json
{
  "version": "v2",
  "activated_at": "2026-06-28T10:30:00",
  "model_path": "/path/to/mlops/models/v2/model.pth"
}
```

## Version Lifecycle

### 1. Training
```
python mlops/scripts/train_model.py --output mlops/models/v4
```
Outputs: `model.pth`, `metadata.json`, `training_history.json`

### 2. Evaluation
```
python mlops/scripts/evaluate_model.py --model mlops/models/v4/model.pth
```
Outputs: `performance.json` with metrics

### 3. Deployment
```
python mlops/scripts/deploy_model.py --activate v4
```
Updates: `active_version.json`

### 4. Backend Integration
```
python mlops/scripts/deploy_model.py --version v4 --copy-to model/best_ddqn_hospital_fair.pth
```
Copies model file to backend.

## Performance Metrics (performance.json)

```json
{
  "metrics": {
    "fairness_score": 0.88,      // Wait time fairness (0-1, higher better)
    "efficiency_score": 0.92,    // Queue efficiency (0-1, higher better)
    "accuracy": 0.89,            // Priority ordering accuracy
    "inference_latency": {
      "mean_ms": 43.5,
      "median_ms": 42.1,
      "std_ms": 5.2
    }
  }
}
```

## Model Comparison

List all versions:
```bash
python mlops/scripts/deploy_model.py --list-versions
```

Output:
```
v1 - Trained: 2026-06-15
     Fairness: 0.82
     Latency: 52ms
     
v2 - Trained: 2026-06-22
     Fairness: 0.85
     Latency: 45ms [ACTIVE]

v3 - Trained: 2026-06-28
     Fairness: 0.88
     Latency: 43ms
```

## Rollback

To rollback to a previous version:
```bash
python mlops/scripts/deploy_model.py --activate v2
```

## Model Storage Best Practices

1. **Never manually delete version directories** - Use deploy script
2. **Keep metadata with each version** - For traceability
3. **Archive old versions** - Move to backup after 3 months
4. **Monitor active model** - Track inference success rate
