the auth is working finew for me the thing tyhat is not working is matching    ` Restart Engage Server with REST API endpoints

Write-Host ""
Write-Host "🔄 Restarting Engage Server..." -ForegroundColor Cyan
Write-Host ""

# Kill existing server on port 3002
$processes = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $processes) {
    Write-Host "Stopping process $pid..." -ForegroundColor Yellow
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

# Start new server
Write-Host "Starting server..." -ForegroundColor Green
Set-Location backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host 'Engage Server Starting...' -ForegroundColor Green; node engage-server.js" -WindowStyle Normal

Start-Sleep -Seconds 3

# Check if server started
$listening = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-Host ""
    Write-Host "✅ Server is running on port 3002" -ForegroundColor Green
    Write-Host ""
    Write-Host "REST API endpoints available:" -ForegroundColor Cyan
    Write-Host "  POST http://localhost:3002/api/chess/create" -ForegroundColor White
    Write-Host "  POST http://localhost:3002/api/chess/join" -ForegroundColor White
    Write-Host "  GET  http://localhost:3002/api/chess/room/:roomId" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "⚠️ Server may still be starting..." -ForegroundColor Yellow
    Write-Host "Check the new PowerShell window for server logs" -ForegroundColor Yellow
}

Set-Location ..

