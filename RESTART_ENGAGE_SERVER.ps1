# Restart Engage Server (port 3002)
Write-Host "🔄 Restarting Engage Server (port 3002)..." -ForegroundColor Cyan
Write-Host ""

# Find and kill process on port 3002
$processes = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    Write-Host "Found $($processes.Count) process(es) on port 3002" -ForegroundColor Yellow
    foreach ($pid in $processes) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  - Killing process $pid ($($proc.ProcessName))" -ForegroundColor Red
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "✅ All processes on port 3002 killed" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "✅ No processes found on port 3002" -ForegroundColor Green
}

Write-Host ""
Write-Host "📝 Starting Engage server..." -ForegroundColor Cyan
Write-Host ""

cd backend

# Check if nodemon is available
if (Get-Command nodemon -ErrorAction SilentlyContinue) {
    Write-Host "✅ Using nodemon (auto-reload enabled)" -ForegroundColor Green
    nodemon engage-server.js
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "✅ Using node (manual restart required)" -ForegroundColor Yellow
    node engage-server.js
} else {
    Write-Host "❌ Node.js not found!" -ForegroundColor Red
    Write-Host "   Please install Node.js or use: npm install -g nodemon" -ForegroundColor Yellow
    exit 1
}

