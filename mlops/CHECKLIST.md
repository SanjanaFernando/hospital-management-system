# MLOps Checklist

## Setup (First Time)
- [ ] Install Python dependencies: `pip install -r mlops/requirements.txt`
- [ ] Copy and configure: `cp mlops/config/.env.example .env`
- [ ] Set MongoDB URI in `.env`
- [ ] Create `mlops/logs/training/`, `mlops/logs/evaluation/`, `mlops/logs/inference/` directories

## Data Pipeline
- [ ] Extract historical data: `python mlops/scripts/collect_data.py`
- [ ] Review collected data in `mlops/data/raw/`
- [ ] Preprocess data (handled by train script)

## Model Training
- [ ] Review training config: `mlops/config/training_config.json`
- [ ] Adjust hyperparameters if needed
- [ ] Train model: `python mlops/scripts/train_model.py`
- [ ] Check training logs: `mlops/logs/training/training.log`

## Evaluation
- [ ] Evaluate on test set: `python mlops/scripts/evaluate_model.py`
- [ ] Review metrics against performance targets
- [ ] Check fairness, efficiency, accuracy scores

## Deployment
- [ ] List versions: `python mlops/scripts/deploy_model.py --list-versions`
- [ ] Activate new version: `python mlops/scripts/deploy_model.py --activate v2`
- [ ] Copy to backend: `python mlops/scripts/deploy_model.py --version v2 --copy-to model/best_ddqn_hospital_fair.pth`
- [ ] Restart Next.js server to load new model

## Monitoring
- [ ] Monitor inference: `python mlops/scripts/monitor_inference.py`
- [ ] Track success rate and latency
- [ ] Watch for increased fallback to priority sort
- [ ] Compare metrics with baseline

## Maintenance
- [ ] Weekly: Retrain if performance drifts
- [ ] Monthly: Archive old model versions
- [ ] Monthly: Review logs for errors
- [ ] Quarterly: Update training data retention policy

## Automated CI/CD (Optional)
- [ ] Create `.github/workflows/mlops-retrain.yml`
- [ ] Test workflow manually
- [ ] Enable automatic weekly retraining
- [ ] Set up Slack notifications for failures
