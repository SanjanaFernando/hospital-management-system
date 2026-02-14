@echo off
REM Windows batch script to seed the hospital-management database
REM Loads MONGODB_URI from .env.local and runs the seed script

for /f "tokens=*" %%i in ('findstr /R "^MONGODB_URI=" .env.local') do set %%i

if "%MONGODB_URI%"=="" (
    echo Error: MONGODB_URI not found in .env.local
    exit /b 1
)

echo Seeding hospital-management database...
node scripts/seedDatabase.mjs
