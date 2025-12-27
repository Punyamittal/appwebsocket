# Fix Socket.IO Timeout - Kill Multiple Server Instances

Write-Host "🔍 Checking for multiple server instances on port 3002..." -ForegroundColor Cyan
Write-Host ""

# Find all processes using port 3002
$processes = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes.Count -eq 0) {
    Write-Host "✅ No processes found on port 3002" -ForegroundColor Green
    Write-Host "Port is free - you can start the server now" -ForegroundColor Yellow
    exit 0
}

Write-Host "⚠️  Found $($processes.Count) process(es) on port 3002:" -ForegroundColor Yellow
Write-Host ""

foreach ($pid in $processes) {
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "  PID: $pid - $($proc.ProcessName) (Started: $($proc.StartTime))" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "🛑 Killing all processes on port 3002..." -ForegroundColor Red

foreach ($pid in $processes) {
    try {
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Write-Host "  ✅ Killed PID: $pid" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Failed to kill PID: $pid - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "🔍 Verifying port is free..." -ForegroundColor Cyan

$remaining = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue

if ($remaining) {
    Write-Host "⚠️  Warning: Port 3002 still in use!" -ForegroundColor Yellow
    Write-Host "You may need to manually kill the processes" -ForegroundColor Yellow
} else {
    Write-Host "✅ Port 3002 is now free!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Next steps:" -ForegroundColor Cyan
    Write-Host "1. Start the server: cd backend && npm run start:engage" -ForegroundColor White
    Write-Host "2. Verify only ONE instance is running" -ForegroundColor White
    Write-Host "3. Test connection in your app" -ForegroundColor White
}

