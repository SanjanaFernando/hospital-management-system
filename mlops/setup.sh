#!/bin/bash
# MLOps Pipeline - Complete Setup & Testing Script
# Run this to set up everything from scratch

set -e  # Exit on error

echo "================================================"
echo "MLOps Pipeline Setup & Testing"
echo "================================================"

# Step 1: Install Python Dependencies
echo ""
echo "Step 1️⃣  Installing Python dependencies..."
pip install -r mlops/requirements.txt
echo "✅ Dependencies installed"

# Step 2: Create .env
echo ""
echo "Step 2️⃣  Setting up environment..."
if [ ! -f .env ]; then
    cp mlops/config/.env.example .env
    echo "✅ Created .env (please edit with your MongoDB URI)"
else
    echo "✅ .env already exists"
fi

# Step 3: Create log directories
echo ""
echo "Step 3️⃣  Creating log directories..."
mkdir -p mlops/logs/training
mkdir -p mlops/logs/evaluation
mkdir -p mlops/logs/inference
echo "✅ Log directories created"

# Step 4: Test Python imports
echo ""
echo "Step 4️⃣  Testing Python imports..."
python -c "import torch; print(f'✅ PyTorch: {torch.__version__}')"
python -c "import pandas; print(f'✅ Pandas: {pandas.__version__}')"
python -c "import numpy; print(f'✅ NumPy: {numpy.__version__}')"

# Step 5: Collect sample data
echo ""
echo "Step 5️⃣  Collecting sample data (demonstrating pipeline)..."
python mlops/scripts/collect_data.py --days 30 --output mlops/data/raw
echo "✅ Sample data collected"

# Step 6: Train model
echo ""
echo "Step 6️⃣  Training initial model..."
python mlops/scripts/train_model.py --output mlops/models/v1
echo "✅ Model training completed"

# Step 7: Evaluate model
echo ""
echo "Step 7️⃣  Evaluating model..."
python mlops/scripts/evaluate_model.py --model mlops/models/v1/model.pth --output mlops/models/v1/performance.json
echo "✅ Model evaluation completed"

# Step 8: List versions
echo ""
echo "Step 8️⃣  Listing available versions..."
python mlops/scripts/deploy_model.py --list-versions
echo "✅ Version listing completed"

# Step 9: Activate version
echo ""
echo "Step 9️⃣  Activating model version..."
python mlops/scripts/deploy_model.py --activate v1
echo "✅ Version activated"

# Step 10: Copy to backend
echo ""
echo "Step 🔟 Deploying to backend..."
python mlops/scripts/deploy_model.py --version v1 --copy-to model/best_ddqn_hospital_fair.pth
echo "✅ Model deployed to backend"

echo ""
echo "================================================"
echo "✅ MLOps Pipeline Setup Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Review metrics in: mlops/models/v1/performance.json"
echo "2. Check active model: mlops/models/active_version.json"
echo "3. Start your Next.js app: npm run dev"
echo "4. Test inference in queueAi.ts"
echo ""
