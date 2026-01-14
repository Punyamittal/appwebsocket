# Fix SkipOn - Stop conflicting servers and start fresh

Write-Host "🔧 Fixing SkipOn..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop all Python processes (backend servers)
Write-Host "1. Stopping all backend servers..." -ForegroundColor Yellow
try {
    $pythonProcesses = Get-Process python -ErrorAction SilentlyContinue
    if ($pythonProcesses) {
        Write-Host "   Found $($pythonProcesses.Count) Python process(es)" -ForegroundColor Gray
        $pythonProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ Stopped all Python processes" -ForegroundColor Green
    } else {
        Write-Host "   ✅ No Python processes running" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Error stopping processes: $_" -ForegroundColor Yellow
}

# Step 2: Wait for ports to be released
Write-Host ""
Write-Host "2. Waiting for ports to be released..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Step 3: Check if port 3001 is still in use
Write-Host ""
Write-Host "3. Checking port 3001..." -ForegroundColor Yellow
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    Write-Host "   ⚠️  Port 3001 is still in use!" -ForegroundColor Red
    Write-Host "   Killing processes on port 3001..." -ForegroundColor Yellow
    $pids = $port3001 | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ Stopped process $pid" -ForegroundColor Green
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "   ✅ Port 3001 is free" -ForegroundColor Green
}

# Step 4: Test backend endpoint
Write-Host ""
Write-Host "4. Testing backend endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   ✅ Backend is still running on port 3001" -ForegroundColor Green
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Gray
} catch {
    Write-Host "   ℹ️  Backend is not running (expected)" -ForegroundColor Gray
}

# Step 5: Instructions
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Cleanup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start backend server (in a new terminal):" -ForegroundColor White
Write-Host "   cd app\backend" -ForegroundColor Gray
Write-Host "   python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Wait for server to start (look for 'Uvicorn running')" -ForegroundColor White
Write-Host ""
Write-Host "3. Test the endpoint:" -ForegroundColor White
Write-Host "   `$body = @{ guestId = 'test123' } | ConvertTo-Json" -ForegroundColor Gray
Write-Host "   Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body `$body" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Start frontend (in another terminal):" -ForegroundColor White
Write-Host "   cd app\frontend" -ForegroundColor Gray
Write-Host "   npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Test SkipOn in browser:" -ForegroundColor White
Write-Host "   - Open: http://localhost:8081" -ForegroundColor Gray
Write-Host "   - Navigate to 'Chat On'" -ForegroundColor Gray
Write-Host "   - Click 'Start Chat'" -ForegroundColor Gray
Write-Host "   - Check browser console (F12) for errors" -ForegroundColor Gray
Write-Host ""



