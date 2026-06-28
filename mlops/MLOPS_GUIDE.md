# MLOps Pipeline Guide - Hospital Management System

## Overview
This MLOps pipeline manages the lifecycle of the DDQN (Double Deep Q-Network) model for queue optimization.

```
┌─────────────────────────────────────────────────────────────────┐
│                     MLOps Pipeline                               │
└─────────────────────────────────────────────────────────────────┘

1. DATA COLLECTION          2. TRAINING             3. EVALUATION
   └─ Extract historical    │  └─ Retrain model    │  └─ Test metrics
      queue data from       │    with new data     │    Performance
      MongoDB               │                      │    Fairness
                            │                      │    Efficiency
                            ▼                      ▼
                    4. VERSIONING (model/v1, v2, v3, ...)
                            │
                            ▼
                    5. DEPLOYMENT
                       └─ Update active model
                         Switch version
                         Log metrics
                            │
                            ▼
                    6. MONITORING
                       └─ Track inference success
                         Response times
                         Fallback usage
                         Model drift
```

---

## Directory Structure

```
mlops/
├── MLOPS_GUIDE.md              # This file
├── models/                     # Model storage
│   ├── v1/                     # Version 1
│   │   ├── model.pth           # PyTorch model
│   │   ├── metadata.json       # Version info
│   │   └── performance.json    # Evaluation metrics
│   ├── v2/                     # Version 2
│   ├── active_version.json     # Currently active model
│   └── README.md               # Model versioning info
├── scripts/                    # Python workflows
│   ├── collect_data.py         # Extract training data from MongoDB
│   ├── train_model.py          # Retrain DDQN
│   ├── evaluate_model.py       # Evaluation metrics
│   ├── deploy_model.py         # Deploy new version
│   └── monitor_inference.py    # Monitor performance
├── config/                     # Configuration
│   ├── model_config.json       # Model hyperparameters
│   ├── training_config.json    # Training settings
│   └── mongodb_config.json     # Database connection
├── data/                       # Training data
│   ├── raw/                    # Raw data from MongoDB
│   ├── processed/              # Processed features
│   └── test_sets/              # Validation data
└── logs/                       # Execution logs
    ├── training/               # Training logs
    ├── evaluation/             # Evaluation logs
    └── inference/              # Production inference logs
```

---

## Step-by-Step MLOps Workflow

### 1️⃣ DATA COLLECTION
Extract historical queue and patient data from MongoDB.

**Command:**
```bash
python mlops/scripts/collect_data.py --days 30 --output mlops/data/raw
```

**What it does:**
- Queries MongoDB for past 30 days of patient queue data
- Extracts features: triage level, wait time, ward occupancy, etc.
- Saves to CSV for training

---

### 2️⃣ DATA PREPROCESSING
Prepare data for model training.

**Included in:**
- `train_model.py` handles preprocessing internally
- Features extracted: state vectors (16 dimensions)
- Normalization: Min-max scaling for numerical features

---

### 3️⃣ MODEL TRAINING
Retrain DDQN with new data.

**Command:**
```bash
python mlops/scripts/train_model.py \
  --data mlops/data/processed \
  --config mlops/config/training_config.json \
  --output mlops/models/v2
```

**What it does:**
- Loads preprocessed data
- Trains DDQN with hyperparameters from config
- Saves model checkpoint every epoch
- Logs training metrics (loss, reward, fairness)

**Training Config Example:**
```json
{
  "epochs": 100,
  "batch_size": 32,
  "learning_rate": 0.001,
  "hidden_dims": [128, 128],
  "replay_buffer_size": 10000,
  "target_update_freq": 1000
}
```

---

### 4️⃣ MODEL EVALUATION
Test model performance on validation set.

**Command:**
```bash
python mlops/scripts/evaluate_model.py \
  --model mlops/models/v2/model.pth \
  --data mlops/data/test_sets \
  --output mlops/models/v2/performance.json
```

**Metrics Tracked:**
- **Fairness**: Wait time variance across triage levels
- **Efficiency**: Average queue wait time reduction
- **Accuracy**: Correct priority ordering percentage
- **Latency**: Model inference time (ms)

**Output:**
```json
{
  "fairness_score": 0.85,
  "efficiency_score": 0.92,
  "avg_latency_ms": 45,
  "accuracy": 0.89,
  "timestamp": "2026-06-28T10:30:00Z"
}
```

---

### 5️⃣ VERSION MANAGEMENT
Track and activate model versions.

**List versions:**
```bash
python mlops/scripts/deploy_model.py --list-versions
```

**Output:**
```
Available Versions:
  v1: 2026-06-15 (fairness: 0.82, latency: 52ms)
  v2: 2026-06-22 (fairness: 0.85, latency: 45ms) [ACTIVE]
  v3: 2026-06-28 (fairness: 0.88, latency: 43ms)
```

**Activate new version:**
```bash
python mlops/scripts/deploy_model.py --activate v3
```

This updates `mlops/models/active_version.json` and backend code dynamically loads it.

---

### 6️⃣ DEPLOYMENT
Deploy new model to production.

**Command:**
```bash
python mlops/scripts/deploy_model.py \
  --version v3 \
  --copy-to model/best_ddqn_hospital_fair.pth
```

**What it does:**
- Validates model file exists
- Backs up current model
- Copies new model to backend
- Updates version registry
- Logs deployment timestamp

---

### 7️⃣ MONITORING & LOGGING
Track model performance in production.

**Metrics Collected:**
- ✅ AI inference success rate
- ⏱️ Model inference latency
- ↩️ Fallback to priority sort count
- 📊 Average queue optimization %
- 🔄 Model drift detection

**View logs:**
```bash
# Recent inference logs
tail -f mlops/logs/inference/latest.log

# Training summary
cat mlops/logs/training/training_summary.txt
```

---

## Full MLOps Cycle (Example)

**Day 1: Model Performance Degradation Detected**
```bash
# 1. Collect latest data
python mlops/scripts/collect_data.py --days 7 --output mlops/data/raw

# 2. Train new model
python mlops/scripts/train_model.py \
  --data mlops/data/processed \
  --config mlops/config/training_config.json \
  --output mlops/models/v4

# 3. Evaluate
python mlops/scripts/evaluate_model.py \
  --model mlops/models/v4/model.pth \
  --data mlops/data/test_sets

# 4. If metrics improve → deploy
python mlops/scripts/deploy_model.py --activate v4

# 5. Copy to backend
python mlops/scripts/deploy_model.py \
  --version v4 \
  --copy-to model/best_ddqn_hospital_fair.pth
```

---

## Backend Integration (queueAi.ts)

The system automatically loads the active model version:

```typescript
import { getActiveModelPath } from '@/mlops/get-active-model';

export function reorderQueueWithAi(input: QueueAiInput): QueueAiResult {
  const modelPath = getActiveModelPath(); // Loads from active_version.json
  const scriptPath = path.join(process.cwd(), "scripts", "queue_reorder_infer.py");
  
  // ... inference code
}
```

This allows **zero-downtime model updates**:
1. Deploy new model to `mlops/models/v4/`
2. Update `active_version.json`
3. Next API call loads new model automatically

---

## Automated MLOps (GitHub Actions - Optional)

Create `.github/workflows/mlops-pipeline.yml`:

```yaml
name: MLOps Pipeline

on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly on Sunday 2 AM
  workflow_dispatch:

jobs:
  retrain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Collect data
        run: python mlops/scripts/collect_data.py --days 30
      - name: Train model
        run: python mlops/scripts/train_model.py
      - name: Evaluate
        run: python mlops/scripts/evaluate_model.py
      - name: Deploy if improved
        run: python mlops/scripts/deploy_model.py --auto-deploy
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Model not found | Check `mlops/models/active_version.json` |
| Fallback to priority sort | Check Python script path and model file permissions |
| Slow inference | Check model latency in `mlops/logs/inference/` |
| Data collection fails | Verify MongoDB connection in `mlops/config/mongodb_config.json` |

---

## Next Steps

1. ✅ Review this guide
2. ✅ Set up MongoDB data collection
3. ✅ Configure model hyperparameters
4. ✅ Retrain with production data
5. ✅ Deploy and monitor
6. ✅ Set up automated pipeline (GitHub Actions)
