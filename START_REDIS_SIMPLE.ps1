# Simple Redis Start Script
# This will start Redis using Docker

Write-Host "🔴 Starting Redis..." -ForegroundColor Red
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker is running" -ForegroundColor Green
    } else {
        Write-Host "❌ Docker is not running!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please:" -ForegroundColor Yellow
        Write-Host "1. Open Docker Desktop application" -ForegroundColor White
        Write-Host "2. Wait for it to fully start" -ForegroundColor White
        Write-Host "3. Run this script again" -ForegroundColor White
        exit 1
    }
} catch {
    Write-Host "❌ Docker is not installed or not running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check if container exists
Write-Host ""
Write-Host "Checking for existing Redis container..." -ForegroundColor Yellow
$containerExists = docker ps -a --filter "name=redis-skipon" --format "{{.Names}}" 2>&1

if ($containerExists -match "redis-skipon") {
    Write-Host "Found existing container, starting it..." -ForegroundColor Yellow
    docker start redis-skipon 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Redis container started" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to start container" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Creating new Redis container..." -ForegroundColor Yellow
    docker run -d -p 6379:6379 --name redis-skipon redis:latest 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Redis container created and started" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to create container" -ForegroundColor Red
        exit 1
    }
}

# Wait a moment
Start-Sleep -Seconds 2

# Verify
Write-Host ""
Write-Host "Verifying Redis..." -ForegroundColor Yellow
try {
    $result = redis-cli ping 2>&1
    if ($result -match "PONG") {
        Write-Host "✅ Redis is responding!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Redis may still be starting (wait 5 seconds)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Redis CLI not found, but container is running" -ForegroundColor Yellow
    Write-Host "   Check with: docker ps" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ Redis should now be running on port 6379" -ForegroundColor Green
Write-Host ""
Write-Host "Now restart your Engage server (Ctrl+C and run 'npm run start:engage' again)" -ForegroundColor Cyan

