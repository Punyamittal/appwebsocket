# Restart FastAPI Backend Server (SkipOn)

Write-Host ""
Write-Host "🔄 Restarting FastAPI Backend Server (Port 3001)..." -ForegroundColor Cyan
Write-Host ""

# Kill all processes on port 3001
$processes = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($processes) {
    Write-Host "Stopping processes on port 3001..." -ForegroundColor Yellow
    foreach ($pid in $processes) {
        Write-Host "  Stopping process $pid..." -ForegroundColor Yellow
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "No processes found on port 3001" -ForegroundColor Green
}

# Start new server
Write-Host "Starting FastAPI backend server..." -ForegroundColor Green
Set-Location "app\backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host 'FastAPI Backend Starting...' -ForegroundColor Green; python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload" -WindowStyle Normal

Set-Location ..\..

Start-Sleep -Seconds 3

# Check if server started
$listening = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-Host ""
    Write-Host "✅ Backend server is running on port 3001" -ForegroundColor Green
    Write-Host ""
    Write-Host "API endpoints available:" -ForegroundColor Cyan
    Write-Host "  POST http://localhost:3001/api/skip/match" -ForegroundColor White
    Write-Host "  POST http://localhost:3001/api/skip/leave" -ForegroundColor White
    Write-Host "  GET  http://localhost:3001/api/skip/status" -ForegroundColor White
    Write-Host ""
    Write-Host "Socket.IO available at: http://localhost:3001" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "⚠️ Server may still be starting..." -ForegroundColor Yellow
    Write-Host "Check the new PowerShell window for server logs" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If you see errors, check:" -ForegroundColor Yellow
    Write-Host "  1. Python dependencies installed: pip install -r requirements.txt" -ForegroundColor White
    Write-Host "  2. Redis running (optional): docker run -d -p 6379:6379 redis:latest" -ForegroundColor White
}



