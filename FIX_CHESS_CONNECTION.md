# Fix Chess Connection Issues

## Problem
Chess feature shows: `Connection error to /play-along: timeout`

## Root Cause
The chess feature connects to the **Engage server** (Node.js) on port 3002, which is separate from the FastAPI backend on port 3001.

## Solution

### Quick Fix - Start All Servers

Run this script to start everything:
```powershell
.\START_ALL_SERVERS.ps1
```

This will:
1. ✅ Check/start Redis
2. ✅ Check/start FastAPI backend (port 3001)
3. ✅ Check/start Engage server (port 3002)

### Manual Start

#### 1. Start Redis (Required for Engage server)
```powershell
docker run -d -p 6379:6379 --name redis-skipon redis:latest
```

Or if Redis is already running:
```powershell
docker start redis-skipon
```

#### 2. Start FastAPI Backend (Port 3001)
```powershell
cd backend
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

#### 3. Start Engage Server (Port 3002)
```powershell
cd backend
npm install  # If not already done
npm run start:engage
```

Or directly:
```powershell
cd backend
node engage-server.js
```

## Verify Everything is Running

### Check Backend (Port 3001)
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/" -UseBasicParsing
# Should return: {"message": "Skip On API", "version": "1.0.0"}
```

### Check Engage Server (Port 3002)
```powershell
Invoke-WebRequest -Uri "http://localhost:3002" -UseBasicParsing
# Should return HTML or connection successful
```

### Check Redis
```powershell
redis-cli ping
# Should return: PONG
```

## What I Fixed

1. ✅ **Better error messages** - Now tells you exactly what's wrong
2. ✅ **Increased timeout** - 15 seconds instead of 10
3. ✅ **Better connection handling** - Properly cleans up on error
4. ✅ **Platform detection** - Handles Android emulator correctly
5. ✅ **Start script** - `START_ALL_SERVERS.ps1` to start everything

## Architecture

```
┌─────────────────┐
│   Frontend      │
│   (Expo App)    │
└────────┬────────┘
         │
    ┌─────┴─────┐
    │           │
┌───▼───┐  ┌───▼────┐
│FastAPI│  │Engage  │
│:3001  │  │:3002   │
└───┬───┘  └───┬────┘
    │          │
    │      ┌───▼───┐
    │      │ Redis │
    │      │:6379  │
    │      └───────┘
    │
┌───▼───┐
│MongoDB│
│:27017 │
└───────┘
```

- **FastAPI (3001)**: REST API, Skip On matchmaking, authentication
- **Engage Server (3002)**: Chess games, Watch Along, Sing Along (requires Redis)
- **Redis (6379)**: Room state for Engage features

## Troubleshooting

### "Connection timeout"
- ✅ Engage server is running on port 3002?
- ✅ Redis is running?
- ✅ Check firewall isn't blocking port 3002
- ✅ For mobile: Use computer's IP instead of localhost

### "Redis connection error"
- ✅ Redis is installed and running?
- ✅ Port 6379 is not blocked?
- ✅ Start with: `docker run -d -p 6379:6379 redis:latest`

### "Cannot find module"
- ✅ Run `npm install` in backend folder
- ✅ Check `backend/node_modules` exists

## Quick Test

1. Start all servers: `.\START_ALL_SERVERS.ps1`
2. Open app → Go to Chess
3. Click "Create New Game"
4. Should see room code (6 digits)
5. No more timeout errors! ✅

