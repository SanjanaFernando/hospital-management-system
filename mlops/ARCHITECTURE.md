# MLOps Pipeline - Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  Hospital Management MLOps                       │
└─────────────────────────────────────────────────────────────────┘

PHASE 1: DATA COLLECTION
├─ Extract from MongoDB: patients, wards, beds
├─ Time Range: Last 7-30 days
├─ Output: CSV files with features
└─ Storage: mlops/data/raw/

PHASE 2: PREPROCESSING
├─ Feature Engineering
│  ├─ Triage level (1-5)
│  ├─ Wait time (normalized hours)
│  ├─ Ward occupancy
│  ├─ Age group distribution
│  └─ Temporal features (time of day, day of week)
├─ Normalization: Min-Max scaling
├─ Split: 70% train, 20% validation, 10% test
└─ Output: mlops/data/processed/

PHASE 3: MODEL TRAINING
├─ Algorithm: DDQN (Double Deep Q-Network)
├─ Architecture:
│  ├─ Input: 16-dimensional state vector
│  ├─ Hidden: [128, 128] neurons
│  ├─ Output: 81 possible queue orderings
│  └─ Activation: ReLU + Linear output
├─ Config: mlops/config/training_config.json
├─ Loss: MSE (Mean Squared Error)
├─ Optimizer: Adam
├─ Early Stopping: Yes (patience=15)
└─ Output: mlops/models/v{N}/model.pth

PHASE 4: EVALUATION
├─ Metrics:
│  ├─ Fairness Score (0-1, higher=more fair)
│  ├─ Efficiency Score (0-1, higher=more efficient)
│  ├─ Accuracy (correct priority ordering %)
│  └─ Latency (inference time in ms)
├─ Targets:
│  ├─ Fairness ≥ 0.85
│  ├─ Efficiency ≥ 0.90
│  ├─ Latency ≤ 100ms
│  └─ Accuracy ≥ 0.85
└─ Output: mlops/models/v{N}/performance.json

PHASE 5: VERSION CONTROL
├─ File: mlops/models/active_version.json
├─ Tracks:
│  ├─ Current version (v1, v2, v3, ...)
│  ├─ Activation timestamp
│  ├─ Model file path
│  └─ Verification status
└─ Enables:
   ├─ A/B testing
   ├─ Easy rollback
   └─ Performance comparison

PHASE 6: DEPLOYMENT
├─ Two Strategies:
│  ├─ Soft Update: Update active_version.json (lazy load)
│  │  └─ Takes effect on server restart
│  └─ Hard Update: Copy model to backend (immediate)
│      └─ Applies on next API call
├─ Backup: Previous model backed up
└─ Integration: lib/get-active-model.ts

PHASE 7: INFERENCE (Runtime)
├─ Flow:
│  ├─ queueAi.ts calls getActiveModelPath()
│  ├─ Loads from active_version.json
│  ├─ Runs Python inference script
│  ├─ Gets reordered queue
│  └─ Falls back if model unavailable
├─ Fallback: Priority-based sorting
└─ Logging: mlops/logs/inference/

PHASE 8: MONITORING
├─ Metrics:
│  ├─ Inference success rate
│  ├─ Average latency
│  ├─ Fallback frequency
│  └─ Queue optimization %
├─ Logs: mlops/logs/inference/latest.log
└─ Analysis: monitor_inference.py
```

---

## Command Reference

### Data Collection
```bash
python mlops/scripts/collect_data.py --days 30 --output mlops/data/raw
```

### Training
```bash
python mlops/scripts/train_model.py \
  --data mlops/data/processed \
  --config mlops/config/training_config.json \
  --output mlops/models/v2
```

### Evaluation
```bash
python mlops/scripts/evaluate_model.py \
  --model mlops/models/v2/model.pth \
  --output mlops/models/v2/performance.json
```

### Deployment
```bash
# Activate version
python mlops/scripts/deploy_model.py --activate v2

# Copy to backend
python mlops/scripts/deploy_model.py --version v2 --copy-to model/best_ddqn_hospital_fair.pth

# List versions
python mlops/scripts/deploy_model.py --list-versions
```

### Monitoring
```bash
python mlops/scripts/monitor_inference.py --hours 24
```

---

## Files & Directories

### Core MLOps
```
mlops/
├── MLOPS_GUIDE.md              # Full documentation
├── QUICKSTART.md               # Quick start guide
├── CHECKLIST.md                # Implementation checklist
├── ARCHITECTURE.md             # This file
│
├── models/                     # Model storage
│   ├── v1/
│   │   ├── model.pth           # Weights
│   │   ├── metadata.json       # Training info
│   │   └── performance.json    # Metrics
│   ├── v2/
│   ├── active_version.json     # Current active model
│   └── README.md
│
├── scripts/                    # Python pipeline
│   ├── collect_data.py         # Data extraction
│   ├── train_model.py          # Training
│   ├── evaluate_model.py       # Evaluation
│   ├── deploy_model.py         # Deployment
│   └── monitor_inference.py    # Monitoring
│
├── config/                     # Configuration
│   ├── model_config.json       # Architecture
│   ├── training_config.json    # Training params
│   ├── mongodb_config.json     # DB settings
│   └── .env.example            # Environment template
│
├── data/                       # Training data
│   ├── raw/                    # Raw MongoDB exports
│   ├── processed/              # Preprocessed data
│   └── test_sets/              # Validation data
│
└── logs/                       # Execution logs
    ├── training/               # Training logs
    ├── evaluation/             # Evaluation logs
    └── inference/              # Production logs
```

### Integration Points
```
lib/
├── get-active-model.ts         # Load active model (TypeScript)

scripts/
├── queue_reorder_infer.py      # Inference script

model/
└── best_ddqn_hospital_fair.pth # Backend model (fallback)
```

---

## Key Concepts

### DDQN (Double Deep Q-Network)
- Learns optimal queue ordering through reinforcement learning
- Input: Hospital state (16 features)
- Output: Q-values for 81 possible actions (queue orderings)
- Benefits: Fair + efficient queue management

### Model Versioning
- Each trained model gets a version (v1, v2, v3, ...)
- Stores training history and performance metrics
- Enables easy rollback if issues arise
- Supports A/B testing in production

### Active Version Pattern
- `mlops/models/active_version.json` determines which model is used
- Updated by deploy scripts
- Loaded by `lib/get-active-model.ts`
- Zero-downtime model updates

### Fallback Strategy
- If model inference fails: uses priority-based sorting
- Ensures system reliability
- Tracked for monitoring model health

---

## Performance Targets

| Metric | Target | Impact |
|--------|--------|--------|
| Fairness Score | ≥ 0.85 | Low variance in wait times across priorities |
| Efficiency Score | ≥ 0.90 | Reduces total queue wait time |
| Inference Latency | ≤ 100ms | Ensures responsive API |
| Accuracy | ≥ 0.85 | Correct priority ordering |

---

## Typical Workflow

**Monday - Performance Review**
```bash
python mlops/scripts/monitor_inference.py --hours 168  # Last week
```

**If degradation detected:**
```bash
# Tuesday - Retrain
python mlops/scripts/collect_data.py --days 7
python mlops/scripts/train_model.py --output mlops/models/v3

# Wednesday - Evaluate
python mlops/scripts/evaluate_model.py --model mlops/models/v3/model.pth

# Thursday - Deploy
python mlops/scripts/deploy_model.py --activate v3
python mlops/scripts/deploy_model.py --version v3 --copy-to model/best_ddqn_hospital_fair.pth

# Friday - Monitor
python mlops/scripts/monitor_inference.py --hours 24
```

---

## Automated (GitHub Actions)

Run weekly retraining automatically:
- Collect data from past 7 days
- Train new model
- Evaluate performance
- Deploy if metrics improve
- Notify via Slack
- Commit changes to git

See `.github/workflows/mlops-retrain.yml`
