# Start Backend Server (FastAPI)
# This script activates the virtual environment and starts the server

Write-Host "🚀 Starting FastAPI backend server..." -ForegroundColor Cyan
Write-Host ""

cd backend

# Check for virtual environment
if (Test-Path "venv\Scripts\Activate.ps1") {
    Write-Host "✅ Found virtual environment: venv\" -ForegroundColor Green
    .\venv\Scripts\Activate.ps1
    Write-Host "✅ Virtual environment activated" -ForegroundColor Green
} elseif (Test-Path ".venv\Scripts\Activate.ps1") {
    Write-Host "✅ Found virtual environment: .venv\" -ForegroundColor Green
    .\.venv\Scripts\Activate.ps1
    Write-Host "✅ Virtual environment activated" -ForegroundColor Green
} else {
    Write-Host "❌ No virtual environment found!" -ForegroundColor Red
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    Write-Host "✅ Created virtual environment" -ForegroundColor Green
    .\venv\Scripts\Activate.ps1
    Write-Host "Installing dependencies from requirements.txt..." -ForegroundColor Yellow
    pip install -r requirements.txt
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "📡 Starting server on port 3001..." -ForegroundColor Cyan
Write-Host ""

# Start the server
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload

