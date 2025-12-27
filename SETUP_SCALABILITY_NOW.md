# 🚀 Setup Scalability RIGHT NOW

## Current Status Check

Run this to check your setup:
```powershell
cd backend
.\check-scalability.ps1
```

---

## ✅ What You Need RIGHT NOW (3 Steps)

### Step 1: Install & Start Redis ⚠️ **CRITICAL**

**Redis is REQUIRED** - the server won't work without it.

#### Quickest Method (Docker):
```powershell
docker run -d -p 6379:6379 --name redis-skipon redis:latest
```

#### Verify it's running:
```powershell
redis-cli ping
# Should return: PONG
```

**If you don't have Docker:**
- Download Redis for Windows: https://github.com/microsoftarchive/redis/releases
- Or use WSL: `wsl redis-server`

---

### Step 2: Install Dependencies

```powershell
cd backend
npm install
```

This installs:
- ✅ redis (v4.7.0)
- ✅ socket.io (v4.7.2)  
- ✅ chess.js (v1.4.0)
- ✅ express (v4.18.2)

---

### Step 3: Start the Server

```powershell
cd backend
npm run start:engage
```

**You should see:**
```
[REDIS] ✅ Connected to Redis
🚀 ENGAGE Socket.IO Server Running
Port: 3002
Max Connections: 2000
Optimized for: 1000+ concurrent users
```

---

## 🎯 That's It!

Once these 3 steps are done, your server can handle:
- ✅ **2000 concurrent connections**
- ✅ **500 simultaneous chess games**
- ✅ **1000+ users** on a single server

---

## 🚨 Common Issues

### "Redis connection error"
→ Redis is not running. Start it with Docker or install Redis.

### "Cannot find module 'redis'"
→ Run `npm install` in the backend directory.

### "Port 3002 already in use"
→ Another server is running. Kill it or use a different port.

---

## 📋 Quick Checklist

- [ ] Redis installed and running (`redis-cli ping` returns PONG)
- [ ] Dependencies installed (`npm install` in backend folder)
- [ ] Server started (`npm run start:engage`)
- [ ] See "✅ Connected to Redis" in console
- [ ] See "Max Connections: 2000" in console

---

## 🚀 One-Command Start (After Setup)

Once everything is installed, you can start with:

```powershell
# Terminal 1: Redis (if using Docker)
docker start redis-skipon

# Terminal 2: Server
cd backend
npm run start:engage
```

---

## 📖 More Details

- **Quick Setup Guide**: `backend/QUICK_SCALABILITY_SETUP.md`
- **Full Scalability Guide**: `backend/SCALABILITY_GUIDE.md`
- **Check Script**: `backend/check-scalability.ps1`

