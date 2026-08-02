# Hospital AI Inference Service

A standalone FastAPI microservice that wraps the DDQN-based patient queue reordering model.
Deployed on **Render** and called by the Next.js app via HTTP.

---

## Directory Structure

```
inference-service/
├── main.py                  # FastAPI app (entry point)
├── queue_reorder_lib.py     # Core inference logic (importable library)
├── requirements.txt         # Python dependencies
├── render.yaml              # Render deployment config
├── model/
│   └── best_mappo_shared_predictive.pth   ← YOU MUST ADD THIS (see below)
└── xai/
    ├── __init__.py
    ├── forecaster.py        # Arrival forecaster
    └── config/
        └── forecaster_profile.json
```

---

## Step 1 — Add the Model File

```bash
# Run from hospital-management/ (project root)
cp model/best_mappo_shared_predictive.pth inference-service/model/

git add inference-service/model/best_mappo_shared_predictive.pth
git commit -m "Add AI model for Render deployment"
git push
```

---

## Step 2 — Deploy to Render

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repository
3. Set **Root Directory** to `inference-service`
4. Render will auto-detect `render.yaml` and configure the service
5. Click **Deploy**

Build takes ~5 minutes (PyTorch download). After deployment you get a URL like:
```
https://hospital-ai-inference.onrender.com
```

---

## Step 3 — Configure the Next.js App

### Local development (`.env.local`)
```env
QUEUE_AI_ENDPOINT=https://hospital-ai-inference.onrender.com
```

### Vercel production
In the Vercel dashboard → Settings → Environment Variables:
```
QUEUE_AI_ENDPOINT = https://hospital-ai-inference.onrender.com
```

> **Leave `QUEUE_AI_ENDPOINT` unset** if you want to keep using the local Python subprocess on your dev machine.

---

## API Reference

### `GET /health`
Returns service status and whether the model is loaded.

```json
{ "status": "ok", "model_loaded": true, "model_path": "./model/best_mappo_shared_predictive.pth" }
```

### `POST /reorder`
Accepts a ward snapshot and returns ranked patient IDs.

**Request body:**
```json
{
  "targetWardId": "ward-1",
  "targetWardQueue": [
    { "id": "10001", "name": "John Doe", "priority": "Triage 1", "age": 65 }
  ],
  "targetWardTotalBeds": 20,
  "targetWardOccupiedBeds": 15,
  "patientHistory": []
}
```

**Response:**
```json
{
  "orderedPatientIds": ["10001"],
  "predictive_analytics": {
    "enabled": true,
    "pred_load": 0.72,
    "pred_crit": 0.45,
    "expected_arrivals": 4.3,
    "expected_critical_patients": 1.9,
    "horizon_hours": 6,
    "surge_predicted": false
  },
  "meta": { "action": 42, "weights": [0.5, 0.3, 0.15, 0.05], "modelApplied": true }
}
```

---

## Local Testing

```bash
cd inference-service

# Install deps
pip install torch==2.3.1+cpu --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

# Start server
uvicorn main:app --reload --port 8000

# Test health
curl http://localhost:8000/health

# Test reorder
curl -X POST http://localhost:8000/reorder \
  -H "Content-Type: application/json" \
  -d '{"targetWardId":"ward-1","targetWardQueue":[{"id":"10001","priority":"Triage 1","age":65}],"targetWardTotalBeds":20,"targetWardOccupiedBeds":15}'
```

---

## Notes

- **Free tier cold starts**: Render's free plan spins down after 15 minutes of inactivity. The first request after idle takes ~30s (PyTorch model reload). Upgrade to **Starter** ($7/mo) for always-on.
- **Fallback**: If the inference service is unreachable, `lib/queueAi.ts` automatically falls back to priority-based sorting — the queue page still works.
