# Starting the Engage Server

## Quick Start

### Option 1: Using the helper script (Recommended)
```powershell
cd app\backend
.\start-engage.ps1
```

### Option 2: Using CMD (Bypasses PowerShell execution policy)
```cmd
cd app\backend
node engage-server.js
```

### Option 3: Using npm (if execution policy is fixed)
```powershell
cd app\backend
npm run start:engage
```

## Fixing PowerShell Execution Policy (Optional)

If you want to use `npm` commands in PowerShell, you can fix the execution policy:

### Method 1: For Current User Only (Recommended)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Method 2: Bypass for Current Session Only
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

### Method 3: Use CMD instead
Open Command Prompt (cmd.exe) instead of PowerShell when running npm commands.

## Troubleshooting

### Port 3002 Already in Use
```powershell
# Kill process on port 3002
Get-NetTCPConnection -LocalPort 3002 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Redis Not Running
```powershell
# Start Redis container
docker start redis-skipon
# Or create new container
docker run -d -p 6379:6379 --name redis-skipon redis:latest
```

### Check Server Status
```powershell
# Health check
Invoke-WebRequest -Uri "http://localhost:3002/health"
```


