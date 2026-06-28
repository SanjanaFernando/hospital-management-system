# MLOps Pipeline - Manual Step-by-Step Setup & Testing

## ⚡ Quick Run (Windows PowerShell)

```powershell
cd d:\Undergraduate\7th Sem\FYP\Project Code\hospital-management-system

# Run automated setup
python mlops/setup.bat
```

---

## 📋 Manual Step-by-Step (If you prefer to run individually)

### Step 1: Install Python Dependencies

```bash
pip install -r mlops/requirements.txt
```

**What it installs:**
- `torch` - PyTorch (deep learning)
- `pandas` - Data processing
- `numpy` - Numerical computing
- `pymongo` - MongoDB driver
- `scikit-learn` - ML utilities

**Expected output:**
```
Successfully installed torch-2.0.1 numpy-1.24.3 pandas-2.0.3 ...
```

---

### Step 2: Configure Environment

```bash
# Copy example to .env
cp mlops/config/.env.example .env

# Edit .env with your MongoDB URI (if using MongoDB)
# Otherwise, scripts will use sample data
```

**What to edit in `.env`:**
```
MONGODB_URI=mongodb://localhost:27017/hospital_db
# OR for MongoDB Atlas:
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hospital_db
```

---

### Step 3: Create Log Directories

```bash
mkdir -p mlops/logs/training
mkdir -p mlops/logs/evaluation
mkdir -p mlops/logs/inference
```

---

### Step 4: Collect Data

Extracts 30 days of patient queue data from MongoDB (or creates sample data):

```bash
python mlops/scripts/collect_data.py --days 30 --output mlops/data/raw
```

**Expected output:**
```
2026-06-28 10:15:30 - INFO - Starting data collection...
2026-06-28 10:15:31 - INFO - Creating sample data structure...
2026-06-28 10:15:32 - INFO - Data collection completed successfully!
```

**Files created:**
- `mlops/data/raw/patients_20260628_101530.csv`
- `mlops/data/raw/wards_20260628_101530.csv`
- `mlops/data/raw/metadata_20260628_101530.json`

---

### Step 5: Train Model

Trains DDQN with collected data (takes 1-5 minutes):

```bash
python mlops/scripts/train_model.py \
  --data mlops/data/processed \
  --config mlops/config/training_config.json \
  --output mlops/models/v1
```

**Expected output:**
```
2026-06-28 10:16:00 - INFO - Creating DDQN model...
2026-06-28 10:16:01 - INFO - Loading training data...
2026-06-28 10:16:02 - INFO - Starting training for 100 epochs...
Epoch 1/100 - Train Loss: 0.850234, Val Loss: 0.823451
Epoch 2/100 - Train Loss: 0.745123, Val Loss: 0.721345
...
Epoch 100/100 - Train Loss: 0.123456, Val Loss: 0.134567
2026-06-28 10:20:30 - INFO - Training completed! Model saved to mlops/models/v1
```

**Files created:**
- `mlops/models/v1/model.pth` (PyTorch weights)
- `mlops/models/v1/metadata.json` (training info)
- `mlops/models/v1/training_history.json` (loss curves)

---

### Step 6: Evaluate Model

Tests model performance on validation set:

```bash
python mlops/scripts/evaluate_model.py \
  --model mlops/models/v1/model.pth \
  --output mlops/models/v1/performance.json
```

**Expected output:**
```
============================================================
EVALUATION SUMMARY
============================================================
Fairness Score:   0.8521 / 1.00
Efficiency Score: 0.9234 / 1.00
Accuracy:         0.8923 / 1.00
Avg Latency:      43.21ms
============================================================
```

**File created:**
- `mlops/models/v1/performance.json` (metrics)

---

### Step 7: Check Performance Metrics

View the evaluation results:

```bash
# Windows
type mlops\models\v1\performance.json

# Linux/Mac
cat mlops/models/v1/performance.json
```

**Expected JSON:**
```json
{
  "evaluation_timestamp": "2026-06-28T10:25:00.123456",
  "metrics": {
    "fairness_score": 0.8521,
    "efficiency_score": 0.9234,
    "accuracy": 0.8923,
    "inference_latency": {
      "mean_ms": 43.21,
      "median_ms": 42.50,
      "std_ms": 5.12
    }
  }
}
```

---

### Step 8: List All Versions

See all available models:

```bash
python mlops/scripts/deploy_model.py --list-versions
```

**Expected output:**
```
================================================================================
AVAILABLE MODEL VERSIONS
================================================================================

v1
  Model:    ✓
  Trained:  2026-06-28T10:20:30
  Fairness: 0.8521
  Latency:  43.21ms

================================================================================
```

---

### Step 9: Activate Model Version

Make the model the "active" version (used by backend):

```bash
python mlops/scripts/deploy_model.py --activate v1
```

**Expected output:**
```
2026-06-28 10:26:00 - INFO - Activating version v1...
2026-06-28 10:26:01 - INFO -   Trained at: 2026-06-28T10:20:30.123456
2026-06-28 10:26:01 - INFO -   Epochs: 100
2026-06-28 10:26:01 - INFO -   Fairness Score: 0.8521
2026-06-28 10:26:01 - INFO -   Efficiency Score: 0.9234
2026-06-28 10:26:01 - INFO -   Avg Latency: 43.21ms
2026-06-28 10:26:01 - INFO - ✓ Version v1 is now active!
```

**File updated:**
- `mlops/models/active_version.json` (now points to v1)

---

### Step 10: Deploy to Backend

Copy the model to the backend so Next.js can use it:

```bash
python mlops/scripts/deploy_model.py \
  --version v1 \
  --copy-to model/best_ddqn_hospital_fair.pth
```

**Expected output:**
```
2026-06-28 10:27:00 - INFO - Deploying v1 to model/best_ddqn_hospital_fair.pth...
2026-06-28 10:27:01 - INFO - Backed up existing model to model/best_ddqn_hospital_fair.pth.backup_20260628_102701
2026-06-28 10:27:02 - INFO - ✓ Model deployed to model/best_ddqn_hospital_fair.pth
```

**File updated:**
- `model/best_ddqn_hospital_fair.pth` (new model)
- `model/best_ddqn_hospital_fair.pth.backup_*` (old model backup)

---

## ✅ Verification Checklist

After running setup, verify everything worked:

### 1. Check Dependencies Installed
```bash
python -c "import torch, pandas, numpy; print('✅ All deps installed')"
```

### 2. Check Data Collected
```bash
# Should show CSV files
dir mlops\data\raw\
```

### 3. Check Model Trained
```bash
# Should show model.pth file
dir mlops\models\v1\
```

### 4. Check Metrics
```bash
type mlops\models\v1\performance.json
# Should show: fairness, efficiency, accuracy, latency
```

### 5. Check Active Version
```bash
type mlops\models\active_version.json
# Should show version: v1
```

### 6. Check Backend Model
```bash
# Should exist
dir model\best_ddqn_hospital_fair.pth
```

---

## 🧪 Test Model Inference (Quick Test)

Create a simple test file to verify the model works:

**test_inference.py:**
```python
import json
import subprocess
from pathlib import Path

# Test data
test_input = {
    "targetWardId": "ward-0",
    "targetWardName": "General Medicine",
    "targetWardQueue": [
        {"id": "1", "priority": "Critical"},
        {"id": "2", "priority": "Urgent"},
        {"id": "3", "priority": "Non-urgent"}
    ],
    "targetWardOccupiedBeds": 15,
    "targetWardTotalBeds": 25,
    "wards": [
        {"wardId": "ward-0", "name": "General", "occupiedBeds": 15, "totalBeds": 25, "queueLength": 3}
    ]
}

# Run inference
script_path = Path("scripts/queue_reorder_infer.py")
result = subprocess.run(
    ["python", str(script_path)],
    input=json.dumps(test_input),
    capture_output=True,
    text=True
)

if result.returncode == 0:
    print("✅ Inference successful!")
    print(json.dumps(json.loads(result.stdout), indent=2))
else:
    print("❌ Inference failed:")
    print(result.stderr)
```

**Run test:**
```bash
python test_inference.py
```

---

## 🚀 Start Next.js Server

Once model is deployed, start the app:

```bash
npm run dev
```

The system will now use the trained model for queue optimization!

---

## 📊 Monitor Inference Performance

After running the app for a while, monitor performance:

```bash
python mlops/scripts/monitor_inference.py \
  --log-file mlops/logs/inference/latest.log \
  --hours 1
```

**Expected output:**
```
============================================================
INFERENCE MONITORING SUMMARY
============================================================
Total Inferences: 42
Success Rate: 95.24%
Fallback Rate: 4.76%

Latency Statistics:
  Mean: 43.25ms
  Median: 42.10ms
  Std Dev: 5.34ms

Strategy Distribution:
  ai: 40
  priority: 2
============================================================
```

---

## 📈 Training A New Model (After Collecting More Data)

```bash
# 1. Collect fresh data
python mlops/scripts/collect_data.py --days 7 --output mlops/data/raw

# 2. Train new model
python mlops/scripts/train_model.py --output mlops/models/v2

# 3. Evaluate
python mlops/scripts/evaluate_model.py --model mlops/models/v2/model.pth

# 4. Compare versions
python mlops/scripts/deploy_model.py --list-versions

# 5. If improved, deploy
python mlops/scripts/deploy_model.py --activate v2
python mlops/scripts/deploy_model.py --version v2 --copy-to model/best_ddqn_hospital_fair.pth
```

---

## 🔄 Automated Weekly Retraining

Enable GitHub Actions for automatic weekly retraining:

1. Ensure `.github/workflows/mlops-retrain.yml` exists
2. Set up secrets in GitHub:
   - `MONGODB_URI` - Your MongoDB connection
   - `SLACK_WEBHOOK_URL` (optional) - For notifications
3. Enable Actions in your GitHub repository
4. Workflow runs every Sunday at 2 AM

---

## ⚠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: No module named 'torch'` | Run: `pip install -r mlops/requirements.txt` |
| `FileNotFoundError: model.pth` | Complete Step 5 (train model first) |
| `MONGODB_URI not found` | Set it in `.env` file |
| Model inference too slow | Check GPU: `python -c "import torch; print(torch.cuda.is_available())"` |
| Inference falling back to priority | Check if model file exists and is readable |

---

## ✨ What's Working Now

✅ **Data Pipeline** - Extract historical data  
✅ **Model Training** - DDQN with PyTorch  
✅ **Evaluation** - Comprehensive metrics  
✅ **Versioning** - Track multiple models  
✅ **Deployment** - Zero-downtime updates  
✅ **Monitoring** - Production inference tracking  
✅ **Integration** - Automatic model loading in Next.js  

---

## 🎯 Next Steps

1. ✅ Run the setup script
2. ✅ Verify all steps completed
3. ✅ Review metrics in `mlops/models/v1/performance.json`
4. ✅ Start Next.js: `npm run dev`
5. ✅ Test queue optimization with real data
6. ✅ Monitor production performance
7. ✅ Retrain weekly if needed
