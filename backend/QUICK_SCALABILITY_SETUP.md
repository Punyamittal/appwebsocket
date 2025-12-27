# Quick Scalability Setup - Do This Now

## ✅ Immediate Requirements Checklist

### 1. **Install & Start Redis** (REQUIRED)

Redis is **critical** for scalability. The server will NOT work without it.

#### Option A: Docker (Easiest - Recommended)
```powershell
# Install Docker Desktop first, then:
docker run -d -p 6379:6379 --name redis-skipon redis:latest
```

#### Option B: Windows Native
1. Download Redis for Windows: https://github.com/microsoftarchive/redis/releases
2. Extract and run `redis-server.exe`
3. Or use WSL: `wsl redis-server`

#### Option C: Cloud Redis (Production)
- Use Redis Cloud (free tier available)
- Set `REDIS_HOST` and `REDIS_PORT` environment variables

#### Verify Redis is Running:
```powershell
# Test Redis connection
redis-cli ping
# Should return: PONG
```

---

### 2. **Install Node.js Dependencies** (REQUIRED)

```powershell
cd backend
npm install
```

This installs:
- ✅ `redis` (v4.7.0) - Already in package.json
- ✅ `socket.io` (v4.7.2) - Already in package.json
- ✅ `chess.js` (v1.4.0) - Already in package.json
- ✅ `express` (v4.18.2) - Already in package.json

---

### 3. **Start the Scalable Server** (REQUIRED)

```powershell
cd backend
npm run start:engage
```

Or directly:
```powershell
cd backend
node engage-server.js
```

**Expected Output:**
```
[REDIS] ✅ Connected to Redis
🚀 ENGAGE Socket.IO Server Running
Port: 3002
Max Connections: 2000
Optimized for: 1000+ concurrent users
```

---

### 4. **Environment Variables** (Optional but Recommended)

Create `backend/.env` file:
```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Server Configuration
ENGAGE_PORT=3002
```

---

## 🚨 Troubleshooting

### Problem: "Redis connection error"
**Solution:**
1. Check if Redis is running: `redis-cli ping`
2. If not running, start Redis (see step 1)
3. Check firewall isn't blocking port 6379

### Problem: "Cannot find module 'redis'"
**Solution:**
```powershell
cd backend
npm install
```

### Problem: "Port 3002 already in use"
**Solution:**
```powershell
# Find and kill process
netstat -ano | findstr :3002
taskkill /PID <PID> /F

# Or use different port
$env:ENGAGE_PORT=3003
node engage-server.js
```

### Problem: "Max reconnection attempts reached"
**Solution:**
- Redis is not running or not accessible
- Check Redis is started: `docker ps` (if using Docker)
- Check Redis logs for errors

---

## ✅ Verification Steps

### 1. Check Redis Connection
```powershell
redis-cli ping
# Should return: PONG
```

### 2. Check Server Started
Look for this in console:
```
[REDIS] ✅ Connected to Redis
🚀 ENGAGE Socket.IO Server Running
```

### 3. Test Connection
Open browser: `http://localhost:3002`
- Should see Socket.IO connection page or error (which is fine)

### 4. Monitor Connections
Watch the server logs - you should see:
```
[MONITOR] Active connections: 100
[MONITOR] Active connections: 200
```
(Every 100 connections)

---

## 📊 Current Capacity

With this setup, you can handle:
- ✅ **2000 concurrent connections** per server instance
- ✅ **500 simultaneous chess games** (2 players each)
- ✅ **1000+ users** on single server

---

## 🚀 Next Steps for Production

1. **Add Monitoring**
   - Track connection counts
   - Monitor Redis memory
   - Set up alerts

2. **Load Balancing** (for 2000+ users)
   - Run multiple server instances
   - Use nginx or cloud load balancer

3. **Redis Persistence**
   - Enable AOF or RDB snapshots
   - Set up Redis Sentinel for HA

See `SCALABILITY_GUIDE.md` for detailed scaling strategies.

---

## ⚡ Quick Start Command

**One-liner to get everything running:**

```powershell
# Terminal 1: Start Redis (if using Docker)
docker run -d -p 6379:6379 --name redis-skipon redis:latest

# Terminal 2: Start Server
cd backend
npm install
npm run start:engage
```

That's it! Your scalable server is now running. 🎉

