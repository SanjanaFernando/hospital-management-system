# MAPPO model checkpoints

Place trained PyTorch checkpoints in this folder.

## Recommended files

| File | Description |
|------|-------------|
| `best_mappo_shared_predictive.pth` | **Preferred** — MAPPO trained with predictive analytics (`pred_load`, `pred_crit` in state) |
| `best_mappo_hospital.pth` | Fallback — MAPPO without predictive features (state slots were `0, 0` during training) |

## Copy from Colab / Google Drive

After training in Colab, copy:

```
Google Drive/hospital_models/mappo_predictive.pth
  →  model/best_mappo_shared_predictive.pth
```

Queue reordering uses `best_mappo_shared_predictive.pth` when present, otherwise falls back to `best_mappo_hospital.pth`. The explainability endpoint uses the legacy MAPPO checkpoint because the shared predictive file is a DDQN checkpoint, not a five-actor MAPPO checkpoint.

## Forecaster profile

Predictive inference also uses:

```
xai/config/forecaster_profile.json
```

Regenerate from patient CSV:

```bash
python xai/scripts/build_forecaster_profile.py --csv path/to/patients.csv
```
