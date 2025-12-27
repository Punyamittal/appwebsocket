# Quick Scalability Check Script
# Run this to verify everything is set up correctly

Write-Host "🔍 Checking Scalability Setup..." -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check 1: Redis
Write-Host "1. Checking Redis..." -ForegroundColor Yellow
try {
    $redisTest = redis-cli ping 2>&1
    if ($redisTest -match "PONG") {
        Write-Host "   ✅ Redis is running" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Redis is NOT running!" -ForegroundColor Red
        Write-Host "      Install Redis: docker run -d -p 6379:6379 redis:latest" -ForegroundColor Yellow
        $allGood = $false
    }
} catch {
    Write-Host "   ❌ Redis CLI not found or Redis not running" -ForegroundColor Red
    Write-Host "      Install Redis: docker run -d -p 6379:6379 redis:latest" -ForegroundColor Yellow
    $allGood = $false
}

# Check 2: Node.js
Write-Host "2. Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -ge 16) {
        Write-Host "   ✅ Node.js $nodeVersion (>= 16.0.0)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Node.js version too old: $nodeVersion (need >= 16.0.0)" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host "   ❌ Node.js not found" -ForegroundColor Red
    $allGood = $false
}

# Check 3: Dependencies
Write-Host "3. Checking dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules/redis") {
    Write-Host "   ✅ Redis package installed" -ForegroundColor Green
} else {
    Write-Host "   ❌ Dependencies not installed" -ForegroundColor Red
    Write-Host "      Run: npm install" -ForegroundColor Yellow
    $allGood = $false
}

if (Test-Path "node_modules/socket.io") {
    Write-Host "   ✅ Socket.IO package installed" -ForegroundColor Green
} else {
    Write-Host "   ❌ Socket.IO package not installed" -ForegroundColor Red
    Write-Host "      Run: npm install" -ForegroundColor Yellow
    $allGood = $false
}

# Check 4: Server file
Write-Host "4. Checking server files..." -ForegroundColor Yellow
if (Test-Path "engage-server.js") {
    Write-Host "   ✅ engage-server.js exists" -ForegroundColor Green
} else {
    Write-Host "   ❌ engage-server.js not found" -ForegroundColor Red
    $allGood = $false
}

# Check 5: Port availability
Write-Host "5. Checking port 3002..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "   ⚠️  Port 3002 is in use" -ForegroundColor Yellow
    Write-Host "      Server may already be running" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ Port 3002 is available" -ForegroundColor Green
}

Write-Host ""
if ($allGood) {
    Write-Host "✅ All checks passed! Ready for scalability." -ForegroundColor Green
    Write-Host ""
    Write-Host "Start the server with:" -ForegroundColor Cyan
    Write-Host "   npm run start:engage" -ForegroundColor White
    Write-Host ""
    Write-Host "Or:" -ForegroundColor Cyan
    Write-Host "   node engage-server.js" -ForegroundColor White
} else {
    Write-Host "❌ Some checks failed. Please fix the issues above." -ForegroundColor Red
    Write-Host ""
    Write-Host "Quick fixes:" -ForegroundColor Yellow
    Write-Host "   1. Install Redis: docker run -d -p 6379:6379 redis:latest" -ForegroundColor White
    Write-Host "   2. Install dependencies: npm install" -ForegroundColor White
    Write-Host "   3. Check Node.js version: node --version (need >= 16)" -ForegroundColor White
}

