# Quick script to restart the Engage server

Write-Host "🔄 Restarting Engage Server..." -ForegroundColor Cyan
Write-Host ""

# Find and kill existing Engage server process
$process = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Id -eq 24068 }
if ($process) {
    Write-Host "⚠️  Stopping existing Engage server (PID: $($process.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "✅ Stopped" -ForegroundColor Green
} else {
    Write-Host "ℹ️  No existing Engage server found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🚀 Starting Engage server..." -ForegroundColor Cyan
Write-Host ""

# Start the server
Set-Location "backend"
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "npm run start:engage" -WindowStyle Normal

Write-Host ""
Write-Host "✅ Engage server starting in new window..." -ForegroundColor Green
Write-Host ""
Write-Host "⏳ Wait 5-10 seconds for server to start" -ForegroundColor Yellow
Write-Host "📋 Look for these messages in the server window:" -ForegroundColor Cyan
Write-Host "   - [REDIS] ✅ Connected to Redis" -ForegroundColor White
Write-Host "   - 🚀 ENGAGE Socket.IO Server Running" -ForegroundColor White
Write-Host "   - Port: 3002" -ForegroundColor White
Write-Host ""
Write-Host "Then refresh your app and test Chess!" -ForegroundColor Green

