# Fix Chess Connection - Step by Step

## Current Status
- ✅ Backend dependencies: **INSTALLED**
- ✅ FastAPI backend (port 3001): **RUNNING**
- ❌ Redis: **NOT RUNNING** (Docker not started)
- ❌ Engage server (port 3002): **NOT RUNNING** (needs Redis)

## What You Need

### Option 1: Start Docker Desktop (Easiest)

1. **Open Docker Desktop** application
2. Wait for it to fully start (whale icon in system tray)
3. Then run:
   ```powershell
   docker run -d -p 6379:6379 --name redis-skipon redis:latest
   ```

### Option 2: Install Redis for Windows

1. Download Redis for Windows: https://github.com/microsoftarchive/redis/releases
2. Extract and run `redis-server.exe`
3. Or use WSL: `wsl redis-server`

### Option 3: Use Cloud Redis (Free Tier)

1. Sign up at https://redis.com/try-free/
2. Get connection string
3. Update `backend/engage-server.js`:
   ```javascript
   const redisClient = redis.createClient({
     url: 'redis://your-redis-url:6379'
   });
   ```

## After Redis is Running

### Step 1: Verify Redis
```powershell
redis-cli ping
# Should return: PONG
```

### Step 2: Start Engage Server

Open a **new PowerShell window** and run:
```powershell
cd "C:\Users\punya mittal\app\backend"
npm run start:engage
```

You should see:
```
[REDIS] ✅ Connected to Redis
🚀 ENGAGE Socket.IO Server Running
Port: 3002
```

### Step 3: Test Chess

1. Refresh your app
2. Go to Chess
3. Click "Create New Game"
4. Should work! ✅

## Quick Commands

### Start Everything (if Docker is running)
```powershell
# Terminal 1: Redis
docker start redis-skipon

# Terminal 2: Engage Server
cd backend
npm run start:engage
```

### Check What's Running
```powershell
# Check ports
netstat -ano | findstr ":3001"  # FastAPI
netstat -ano | findstr ":3002"  # Engage Server
netstat -ano | findstr ":6379"  # Redis

# Check Redis
redis-cli ping
```

## Troubleshooting

### "Docker not running"
- Start Docker Desktop application
- Wait for it to fully initialize
- Try again

### "Redis connection error" in Engage server
- Redis is not running
- Start Redis first (see options above)
- Then restart Engage server

### "Port 3002 already in use"
- Another Engage server is running
- Kill it: `netstat -ano | findstr ":3002"` then `taskkill /PID <PID> /F`
- Or use different port: `$env:ENGAGE_PORT=3003; npm run start:engage`

## Summary

**You need 3 things running:**
1. ✅ FastAPI Backend (port 3001) - Already running
2. ❌ Redis (port 6379) - **START THIS FIRST**
3. ❌ Engage Server (port 3002) - **START THIS AFTER REDIS**

**The Engage server CANNOT start without Redis!**

