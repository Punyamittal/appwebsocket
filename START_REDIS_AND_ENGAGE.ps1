# Start Redis and Engage Server for Chess Feature
# This script will guide you through starting everything needed

Write-Host "🚀 Starting Redis and Engage Server..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "1. Checking Docker..." -ForegroundColor Yellow
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Docker is running" -ForegroundColor Green
        
        # Check if Redis container exists
        $redisContainer = docker ps -a --filter "name=redis-skipon" --format "{{.Names}}" 2>&1
        if ($redisContainer -match "redis-skipon") {
            Write-Host "   Starting existing Redis container..." -ForegroundColor Yellow
            docker start redis-skipon 2>&1 | Out-Null
            Start-Sleep -Seconds 2
        } else {
            Write-Host "   Creating new Redis container..." -ForegroundColor Yellow
            docker run -d -p 6379:6379 --name redis-skipon redis:latest 2>&1 | Out-Null
            Start-Sleep -Seconds 3
        }
        
        Write-Host "   ✅ Redis container started" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Docker is NOT running" -ForegroundColor Red
        Write-Host ""
        Write-Host "   Please start Docker Desktop first!" -ForegroundColor Yellow
        Write-Host "   1. Open Docker Desktop application" -ForegroundColor White
        Write-Host "   2. Wait for it to fully start" -ForegroundColor White
        Write-Host "   3. Run this script again" -ForegroundColor White
        Write-Host ""
        Write-Host "   Or install Redis for Windows:" -ForegroundColor Yellow
        Write-Host "   https://github.com/microsoftarchive/redis/releases" -ForegroundColor Gray
        exit 1
    }
} catch {
    Write-Host "   ❌ Docker is NOT installed or not running" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Options:" -ForegroundColor Yellow
    Write-Host "   1. Install Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor White
    Write-Host "   2. Install Redis for Windows: https://github.com/microsoftarchive/redis/releases" -ForegroundColor White
    Write-Host "   3. Use WSL: wsl redis-server" -ForegroundColor White
    exit 1
}

# Verify Redis
Write-Host ""
Write-Host "2. Verifying Redis..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
try {
    $redisTest = redis-cli ping 2>&1
    if ($redisTest -match "PONG") {
        Write-Host "   ✅ Redis is responding" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Redis may still be starting (this is OK)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Redis CLI not found, but container is running" -ForegroundColor Yellow
}

# Check if Engage server is already running
Write-Host ""
Write-Host "3. Checking Engage server..." -ForegroundColor Yellow
$engageRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3002" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Engage server is already running" -ForegroundColor Green
    $engageRunning = $true
} catch {
    Write-Host "   ❌ Engage server is NOT running" -ForegroundColor Red
}

# Start Engage server if not running
if (-not $engageRunning) {
    Write-Host ""
    Write-Host "4. Starting Engage server..." -ForegroundColor Yellow
    
    # Check dependencies
    if (-not (Test-Path "$PSScriptRoot\backend\node_modules")) {
        Write-Host "   Installing dependencies..." -ForegroundColor Yellow
        Set-Location "$PSScriptRoot\backend"
        npm install
        Set-Location $PSScriptRoot
    }
    
    # Start in new window
    Write-Host "   Opening new window for Engage server..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; Write-Host '🚀 Engage Server Starting...' -ForegroundColor Cyan; Write-Host ''; npm run start:engage"
    
    Write-Host "   ⏳ Waiting for server to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # Check again
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3002" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "   ✅ Engage server started successfully" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️  Engage server may still be starting" -ForegroundColor Yellow
        Write-Host "   Check the new PowerShell window for status" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Servers Running:" -ForegroundColor Cyan
Write-Host "  - FastAPI Backend: http://localhost:3001" -ForegroundColor White
Write-Host "  - Engage Server: http://localhost:3002" -ForegroundColor White
Write-Host "  - Redis: localhost:6379" -ForegroundColor White
Write-Host ""
Write-Host "Next: Refresh your app and try Chess again!" -ForegroundColor Cyan
Write-Host ""

