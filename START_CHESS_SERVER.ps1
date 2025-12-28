# Start Engage Server for Chess Game
Write-Host "🚀 Starting Engage Server (Chess Game)..." -ForegroundColor Cyan
Write-Host ""

cd backend

# Check if server file exists
if (-not (Test-Path "engage-server.js")) {
    Write-Host "❌ engage-server.js not found!" -ForegroundColor Red
    Write-Host "   Make sure you're in the project root directory" -ForegroundColor Yellow
    exit 1
}

# Check if Node.js is available
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not found!" -ForegroundColor Red
    Write-Host "   Please install Node.js first" -ForegroundColor Yellow
    exit 1
}

# Check if port 3002 is already in use
$existing = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "⚠️  Port 3002 is already in use" -ForegroundColor Yellow
    Write-Host "   Killing existing process..." -ForegroundColor Yellow
    $existing | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Write-Host "✅ Starting server on port 3002..." -ForegroundColor Green
Write-Host ""
Write-Host "Server will be available at: http://localhost:3002" -ForegroundColor Cyan
Write-Host "Chess move endpoint: POST http://localhost:3002/api/chess/move" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start the server
node engage-server.js

