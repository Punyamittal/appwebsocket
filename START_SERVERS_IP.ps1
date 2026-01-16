# Start All Servers for Skip On App (IP Address Version)
# This starts both FastAPI backend and Engage server on IP address
# Use this for testing video calls between Mac and phone on same network

$IP_ADDRESS = "172.20.139.243"

Write-Host "🚀 Starting All Servers for Skip On on IP: $IP_ADDRESS..." -ForegroundColor Cyan
Write-Host ""

# Check Redis first
Write-Host "1. Checking Redis..." -ForegroundColor Yellow
try {
    $redisTest = redis-cli ping 2>&1
    if ($redisTest -match "PONG") {
        Write-Host "   ✅ Redis is running" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Redis is NOT running!" -ForegroundColor Red
        Write-Host "   Starting Redis with Docker..." -ForegroundColor Yellow
        docker run -d -p 6379:6379 --name redis-skipon redis:latest 2>&1 | Out-Null
        Start-Sleep -Seconds 3
        Write-Host "   ✅ Redis started" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Redis CLI not found. Install Redis or use Docker." -ForegroundColor Yellow
    Write-Host "   Docker command: docker run -d -p 6379:6379 --name redis-skipon redis:latest" -ForegroundColor Gray
}

Write-Host ""

# Check if backend (port 3001) is running
Write-Host "2. Checking FastAPI backend (port 3001)..." -ForegroundColor Yellow
$backendRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://$IP_ADDRESS:3001/api/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Backend is running" -ForegroundColor Green
    $backendRunning = $true
} catch {
    Write-Host "   ❌ Backend is NOT running" -ForegroundColor Red
    Write-Host "   Starting backend server..." -ForegroundColor Yellow
    
    # Start backend in new window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python -m uvicorn server:socket_app --host $IP_ADDRESS --port 3001 --reload"
    
    Write-Host "   ⏳ Waiting for backend to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # Check again
    try {
        $response = Invoke-WebRequest -Uri "http://$IP_ADDRESS:3001/api/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "   ✅ Backend started successfully" -ForegroundColor Green
        $backendRunning = $true
    } catch {
        Write-Host "   ⚠️  Backend may still be starting. Check the backend window." -ForegroundColor Yellow
    }
}

Write-Host ""

# Check if engage server (port 3002) is running
Write-Host "3. Checking Engage server (port 3002)..." -ForegroundColor Yellow
$engageRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://$IP_ADDRESS:3002" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Engage server is running" -ForegroundColor Green
    $engageRunning = $true
} catch {
    Write-Host "   ❌ Engage server is NOT running" -ForegroundColor Red
    Write-Host "   Starting engage server..." -ForegroundColor Yellow
    
    # Check if node_modules exists
    if (-not (Test-Path "$PSScriptRoot\backend\node_modules")) {
        Write-Host "   Installing dependencies..." -ForegroundColor Yellow
        Set-Location "$PSScriptRoot\backend"
        npm install
        Set-Location $PSScriptRoot
    }
    
    # Start engage server in new window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; npm run start:engage"
    
    Write-Host "   ⏳ Waiting for engage server to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # Check again
    try {
        $response = Invoke-WebRequest -Uri "http://$IP_ADDRESS:3002" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "   ✅ Engage server started successfully" -ForegroundColor Green
        $engageRunning = $true
    } catch {
        Write-Host "   ⚠️  Engage server may still be starting. Check the engage server window." -ForegroundColor Yellow
        Write-Host "   Note: Engage server requires Redis to be running." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
if ($backendRunning -and $engageRunning) {
    Write-Host "✅ All servers are running on IP: $IP_ADDRESS!" -ForegroundColor Green
    Write-Host "📱 You can now access from your phone using: http://$IP_ADDRESS:8081" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Some servers may still be starting" -ForegroundColor Yellow
}
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server Status:" -ForegroundColor Cyan
Write-Host "- FastAPI (REST + Socket.IO): http://$IP_ADDRESS:3001" -ForegroundColor White
Write-Host "- FastAPI (Socket.IO only): http://$IP_ADDRESS:3003" -ForegroundColor White  
Write-Host "- Engage Server: http://$IP_ADDRESS:3002" -ForegroundColor White
Write-Host "- Frontend: http://$IP_ADDRESS:8081" -ForegroundColor White
Write-Host ""
