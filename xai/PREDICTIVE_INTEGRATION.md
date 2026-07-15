# Predictive Analytics Integration

MAPPO queue reordering now supports **ArrivalForecaster** — the same predictive layer used in Colab training.

## What was added

| File | Role |
|------|------|
| `xai/forecaster.py` | Predicts `pred_load` and `pred_crit` for the next 6 hours |
| `xai/config/forecaster_profile.json` | Default hourly arrival profile + surge thresholds |
| `xai/scripts/build_forecaster_profile.py` | Rebuild profile from patient CSV |
| `xai/explain_engine.py` | State vector slots 9–10 now use predictions (not `0, 0`) |
| `lib/get-mappo-model.ts` | Auto-picks predictive checkpoint when available |
| `lib/queueAi.ts` | Passes forecaster profile to Python inference |
| `app/api/explain/route.ts` | Explain API includes predictive metadata + patient history |

## Runtime flow

```
MongoDB ward + patients
    → build ward snapshot (+ patientHistory)
    → ArrivalForecaster.predict() → pred_load, pred_crit
    → state[8:10] = predictions
    → MAPPO actors → negotiate → queue order
```

## Setup checklist

1. Copy Colab checkpoint to `model/best_mappo_predictive.pth`
2. (Optional) Regenerate forecaster profile from your data:
   ```bash
   python xai/scripts/build_forecaster_profile.py --csv mlops/data/raw/patients_*.csv
   ```
3. Run the app:
   ```bash
   npm run dev
   ```
4. Open a ward queue page — message should mention `MAPPO+Predictive` when the predictive checkpoint is used.

## Environment variables (optional)

```env
MAPPO_CHECKPOINT_PATH=D:\...\model\best_mappo_predictive.pth
FORECASTER_PROFILE_PATH=D:\...\xai\config\forecaster_profile.json
PYTHON_BIN=python
```

## API response fields

`/api/explain` and queue reorder now include:

```json
{
  "predictive_analytics": {
    "enabled": true,
    "pred_load": 0.42,
    "pred_crit": 0.51,
    "surge_predicted": true,
    "surge_thresholds": { "load": 0.347, "crit": 0.436 }
  }
}
```

## Important

Use a checkpoint trained **with** predictive state features. If only `best_mappo_hospital.pth` (non-predictive) is available, the app still runs but forecaster inputs may not match training.
