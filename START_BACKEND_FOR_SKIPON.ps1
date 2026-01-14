# Start Backend Server for SkipOn
# This will start the Python FastAPI server on port 3001

Write-Host "🚀 Starting Backend Server for SkipOn..." -ForegroundColor Cyan
Write-Host ""

$backendDir = "$PSScriptRoot\backend"
if (-not (Test-Path $backendDir)) {
    Write-Host "❌ Backend directory not found: $backendDir" -ForegroundColor Red
    exit 1
}

Write-Host "📍 Backend directory: $backendDir" -ForegroundColor Gray
Write-Host ""

# Check if port 3001 is already in use
Write-Host "1. Checking port 3001..." -ForegroundColor Yellow
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    $pids = $port3001 | Select-Object -ExpandProperty OwningProcess -Unique
    $processes = Get-Process -Id $pids -ErrorAction SilentlyContinue | Select-Object Id,ProcessName
    Write-Host "   ⚠️  Port 3001 is in use by:" -ForegroundColor Yellow
    $processes | ForEach-Object {
        Write-Host "      - Process $($_.Id): $($_.ProcessName)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "   Please stop the process(es) on port 3001 first, or use a different port." -ForegroundColor Yellow
    Write-Host "   To stop: Stop-Process -Id $($pids[0]) -Force" -ForegroundColor Gray
    exit 1
} else {
    Write-Host "   ✅ Port 3001 is free" -ForegroundColor Green
}

Write-Host ""
Write-Host "2. Starting backend server..." -ForegroundColor Yellow
Write-Host "   Command: python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload" -ForegroundColor Gray
Write-Host ""
Write-Host "   📝 This will start in a NEW window so you can see the logs." -ForegroundColor Cyan
Write-Host "   ⏳ Wait for: 'Uvicorn running on http://0.0.0.0:3001'" -ForegroundColor Cyan
Write-Host ""

# Start backend in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; Write-Host '🚀 Starting Backend Server...' -ForegroundColor Cyan; Write-Host ''; python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload"

Write-Host "✅ Backend server starting in new window..." -ForegroundColor Green
Write-Host ""
Write-Host "3. Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Test if server is running
Write-Host ""
Write-Host "4. Testing server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($response.Content -match "Skip On API") {
        Write-Host "   ✅ Backend server is running!" -ForegroundColor Green
        Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Server is running but response is unexpected" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Server may still be starting..." -ForegroundColor Yellow
    Write-Host "   Check the backend window for startup messages" -ForegroundColor Gray
    Write-Host "   Error: $_" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Check the backend window - should show:" -ForegroundColor White
Write-Host "   INFO:     Uvicorn running on http://0.0.0.0:3001" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Test the endpoint:" -ForegroundColor White
Write-Host "   `$body = @{ guestId = 'test123' } | ConvertTo-Json" -ForegroundColor Gray
Write-Host "   Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body `$body" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Start frontend (in another terminal):" -ForegroundColor White
Write-Host "   cd app\frontend" -ForegroundColor Gray
Write-Host "   npm start" -ForegroundColor Gray
Write-Host ""



