# MLOps Quick Start Guide

## 1. Prerequisites

### Install Python Dependencies
```bash
cd hospital-management-system
pip install -r mlops/requirements.txt
```

### Setup MongoDB
```bash
# If using local MongoDB, ensure it's running
# If using MongoDB Atlas, set MONGODB_URI in .env
```

### Configure Environment
```bash
cp mlops/config/.env.example .env
# Edit .env with your MongoDB connection string
```

---

## 2. Data Collection

Collect 30 days of historical patient queue data:

```bash
python mlops/scripts/collect_data.py --days 30 --output mlops/data/raw
```

This creates:
- `mlops/data/raw/patients_*.csv`
- `mlops/data/raw/wards_*.csv`
- `mlops/data/raw/metadata_*.json`

---

## 3. Train New Model

Train a new DDQN model:

```bash
python mlops/scripts/train_model.py \
  --data mlops/data/processed \
  --config mlops/config/training_config.json \
  --output mlops/models/v2
```

Monitor training progress in `mlops/logs/training/training.log`

---

## 4. Evaluate Model

Test the new model's performance:

```bash
python mlops/scripts/evaluate_model.py \
  --model mlops/models/v2/model.pth \
  --data mlops/data/test_sets \
  --output mlops/models/v2/performance.json
```

Check metrics:
```
Fairness Score:   0.85 / 1.00
Efficiency Score: 0.92 / 1.00
Accuracy:         0.89 / 1.00
Avg Latency:      43.50ms
```

---

## 5. Deploy Model

### Option A: Activate New Version
Makes the model active for future inference:

```bash
python mlops/scripts/deploy_model.py --activate v2
```

Backend will automatically load this version on next restart.

### Option B: Copy to Backend Immediately
For immediate deployment without restarting:

```bash
python mlops/scripts/deploy_model.py \
  --version v2 \
  --copy-to model/best_ddqn_hospital_fair.pth
```

---

## 6. Monitor Performance

### List All Versions
```bash
python mlops/scripts/deploy_model.py --list-versions
```

Output:
```
v1: 2026-06-15 (fairness: 0.82, latency: 52ms)
v2: 2026-06-22 (fairness: 0.85, latency: 45ms) [ACTIVE]
v3: 2026-06-28 (fairness: 0.88, latency: 43ms)
```

### Check Inference Metrics
```bash
python mlops/scripts/monitor_inference.py \
  --log-file mlops/logs/inference/latest.log \
  --hours 24
```

---

## 7. Automated Weekly Retraining (Optional)

Create `.github/workflows/mlops-retrain.yml`:

```yaml
name: Weekly Model Retrain

on:
  schedule:
    - cron: '0 2 * * 0'  # Sunday 2 AM
  workflow_dispatch:

jobs:
  retrain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install -r mlops/requirements.txt
      
      - name: Collect data
        run: python mlops/scripts/collect_data.py --days 7
      
      - name: Train model
        run: python mlops/scripts/train_model.py --output mlops/models/v_weekly
      
      - name: Evaluate
        run: python mlops/scripts/evaluate_model.py --model mlops/models/v_weekly/model.pth
      
      - name: Deploy if improved
        run: |
          python mlops/scripts/deploy_model.py \
            --version v_weekly \
            --copy-to model/best_ddqn_hospital_fair.pth
      
      - name: Commit and push
        run: |
          git add -A
          git commit -m "Auto-retrain: Weekly model update"
          git push
```

---

## Complete MLOps Workflow

**Day 1: Performance drops below threshold**

```bash
# 1. Collect latest data
python mlops/scripts/collect_data.py --days 7

# 2. Train new model
python mlops/scripts/train_model.py --output mlops/models/v3

# 3. Evaluate
python mlops/scripts/evaluate_model.py --model mlops/models/v3/model.pth

# 4. If metrics improved → deploy
python mlops/scripts/deploy_model.py --activate v3
python mlops/scripts/deploy_model.py \
  --version v3 \
  --copy-to model/best_ddqn_hospital_fair.pth

# 5. Monitor
python mlops/scripts/monitor_inference.py --hours 24
```

---

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `mlops/models/` | Versioned models (v1, v2, v3, ...) |
| `mlops/data/raw/` | Raw MongoDB exports |
| `mlops/data/processed/` | Preprocessed training data |
| `mlops/logs/` | Training, evaluation, inference logs |
| `mlops/config/` | Model and training configurations |
| `scripts/` | Python pipeline scripts |

---

## Troubleshooting

### Model not loading in backend
- Check `mlops/models/active_version.json` exists
- Verify `model_path` points to valid file
- Check `lib/get-active-model.ts` in queueAi.ts

### Training fails - pymongo not found
```bash
pip install pymongo
```

### Inference falling back to priority sort
- Check if model file exists
- Check Python interpreter can run inference script
- Review `mlops/logs/inference/` logs

---

## Next Steps

1. ✅ Install dependencies
2. ✅ Collect production data
3. ✅ Train first model
4. ✅ Evaluate and deploy
5. ✅ Monitor performance
6. ✅ Set up automated weekly retraining
