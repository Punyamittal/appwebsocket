# Kill all Python processes on port 3001
Write-Host "🔍 Finding processes on port 3001..." -ForegroundColor Cyan

$processes = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    Write-Host "Found $($processes.Count) process(es) on port 3001" -ForegroundColor Yellow
    foreach ($pid in $processes) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  - Killing process $pid ($($proc.ProcessName))" -ForegroundColor Red
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "✅ All processes on port 3001 killed" -ForegroundColor Green
} else {
    Write-Host "✅ No processes found on port 3001" -ForegroundColor Green
}

Write-Host ""
Write-Host "📝 Now start a single server instance:" -ForegroundColor Cyan
Write-Host "   cd backend" -ForegroundColor White
Write-Host "   uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload" -ForegroundColor White

