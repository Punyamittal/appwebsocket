# Quick Start Script for Skip On
# This will check and start everything needed for Skip On to work

Write-Host "🚀 Starting Skip On..." -ForegroundColor Cyan
Write-Host ""

# Check if backend is running
Write-Host "1. Checking backend server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Backend is running" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Backend is NOT running" -ForegroundColor Red
    Write-Host "   Starting backend server..." -ForegroundColor Yellow
    
    # Start backend in new window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload"
    
    Write-Host "   ⏳ Waiting for backend to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # Check again
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "   ✅ Backend started successfully" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️  Backend may still be starting. Check the backend window." -ForegroundColor Yellow
    }
}

# Check Firebase config
Write-Host ""
Write-Host "2. Checking Firebase configuration..." -ForegroundColor Yellow
$firebaseFile = "$PSScriptRoot\frontend\services\firebase.ts"
if (Test-Path $firebaseFile) {
    $content = Get-Content $firebaseFile -Raw
    if ($content -match "databaseURL.*gingr-13c0c-default-rtdb") {
        Write-Host "   ✅ Firebase databaseURL is configured" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Firebase databaseURL may not be set" -ForegroundColor Yellow
        Write-Host "      Check: frontend/services/firebase.ts" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  Firebase config file not found" -ForegroundColor Yellow
}

# Instructions
Write-Host ""
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Make sure Firebase Realtime Database is enabled:" -ForegroundColor White
Write-Host "   - Go to: https://console.firebase.google.com/" -ForegroundColor Gray
Write-Host "   - Select project: gingr-13c0c" -ForegroundColor Gray
Write-Host "   - Enable Realtime Database if not already enabled" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Start frontend:" -ForegroundColor White
Write-Host "   cd frontend" -ForegroundColor Gray
Write-Host "   npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Test Skip On:" -ForegroundColor White
Write-Host "   - Open app → Go to 'Chat On'" -ForegroundColor Gray
Write-Host "   - Click 'Start Chat'" -ForegroundColor Gray
Write-Host "   - Open another instance to test matching" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 Full guide: See SKIP_ON_SETUP.md" -ForegroundColor Cyan

