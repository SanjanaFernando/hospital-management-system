@echo off
REM MLOps Pipeline - Complete Setup & Testing Script (Windows)
REM Run this to set up everything from scratch

setlocal enabledelayedexpansion

echo.
echo ================================================
echo MLOps Pipeline Setup ^& Testing
echo ================================================
echo.

REM Step 1: Install Python Dependencies
echo Step 1 - Installing Python dependencies...
.venv\Scripts\python.exe -m pip install -r mlops\requirements.txt
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    exit /b 1
)
echo ✅ Dependencies installed
echo.

REM Step 2: Create .env
echo Step 2 - Setting up environment...
if not exist .env (
    copy mlops\config\.env.example .env
    echo ✅ Created .env (please edit with your MongoDB URI)
) else (
    echo ✅ .env already exists
)
echo.

REM Step 3: Create log directories
echo Step 3 - Creating log directories...
if not exist mlops\logs\training mkdir mlops\logs\training
if not exist mlops\logs\evaluation mkdir mlops\logs\evaluation
if not exist mlops\logs\inference mkdir mlops\logs\inference
echo ✅ Log directories created
echo.

REM Step 4: Test Python imports
echo Step 4 - Testing Python imports...
.venv\Scripts\python.exe -c "import torch; print(f'PyTorch: {torch.__version__}')" >nul 2>&1
if errorlevel 1 (
    echo ⚠️  PyTorch not found (try: pip install torch)
) else (
    .venv\Scripts\python.exe -c "import torch; print(f'✅ PyTorch: {torch.__version__}')"
)

.venv\Scripts\python.exe -c "import pandas; print(f'✅ Pandas version OK')" >nul 2>&1
.venv\Scripts\python.exe -c "import numpy; print(f'✅ NumPy version OK')" >nul 2>&1
echo.

REM Step 5: Collect sample data
echo Step 5 - Collecting sample data ^(demonstrating pipeline^)...
.venv\Scripts\python.exe mlops\scripts\collect_data.py --days 30 --output mlops\data\raw
if errorlevel 1 (
    echo ❌ Failed to collect data
    exit /b 1
)
echo ✅ Sample data collected
echo.

REM Step 6: Train model
echo Step 6 - Training initial model...
.venv\Scripts\python.exe mlops\scripts\train_model.py --output mlops\models\v1
if errorlevel 1 (
    echo ❌ Failed to train model
    exit /b 1
)
echo ✅ Model training completed
echo.

REM Step 7: Evaluate model
echo Step 7 - Evaluating model...
.venv\Scripts\python.exe mlops\scripts\evaluate_model.py --model mlops\models\v1\model.pth --output mlops\models\v1\performance.json
if errorlevel 1 (
    echo ❌ Failed to evaluate model
    exit /b 1
)
echo ✅ Model evaluation completed
echo.

REM Step 8: List versions
echo Step 8 - Listing available versions...
.venv\Scripts\python.exe mlops\scripts\deploy_model.py --list-versions
echo ✅ Version listing completed
echo.

REM Step 9: Activate version
echo Step 9 - Activating model version...
.venv\Scripts\python.exe mlops\scripts\deploy_model.py --activate v1
if errorlevel 1 (
    echo ❌ Failed to activate version
    exit /b 1
)
echo ✅ Version activated
echo.

REM Step 10: Copy to backend
echo Step 10 - Deploying to backend...
.venv\Scripts\python.exe mlops\scripts\deploy_model.py --version v1 --copy-to model\best_ddqn_hospital_fair.pth
if errorlevel 1 (
    echo ❌ Failed to deploy to backend
    exit /b 1
)
echo ✅ Model deployed to backend
echo.

echo ================================================
echo ✅ MLOps Pipeline Setup Complete!
echo ================================================
echo.
echo Next steps:
echo 1. Review metrics in: mlops\models\v1\performance.json
echo 2. Check active model: mlops\models\active_version.json
echo 3. Start your Next.js app: npm run dev
echo 4. Test inference in queueAi.ts
echo.

endlocal
