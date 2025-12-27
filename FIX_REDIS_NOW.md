# 🔴 Fix Redis Connection - DO THIS NOW

## The Problem
Your Engage server is trying to connect to Redis on port 6379, but Redis is **NOT running**.

**Error:** `ECONNREFUSED 127.0.0.1:6379`

## ✅ Solution - Choose One:

### Option 1: Start Docker Desktop (Easiest - Recommended)

1. **Open Docker Desktop** application
   - Look for Docker icon in system tray
   - Or search "Docker Desktop" in Start menu

2. **Wait for Docker to fully start**
   - You'll see "Docker Desktop is running" in the system tray
   - This takes 30-60 seconds

3. **Run this command:**
   ```powershell
   docker run -d -p 6379:6379 --name redis-skipon redis:latest
   ```

4. **Verify Redis is running:**
   ```powershell
   redis-cli ping
   # Should return: PONG
   ```

5. **Restart your Engage server:**
   - Close the current Engage server window (Ctrl+C)
   - Run: `cd backend && npm run start:engage`
   - Should now see: `[REDIS] ✅ Connected to Redis`

---

### Option 2: Install Redis for Windows (No Docker)

1. **Download Redis for Windows:**
   - https://github.com/microsoftarchive/redis/releases
   - Download the latest `.zip` file

2. **Extract and run:**
   - Extract to a folder (e.g., `C:\Redis`)
   - Run `redis-server.exe`
   - Keep this window open

3. **Verify:**
   ```powershell
   redis-cli ping
   # Should return: PONG
   ```

4. **Restart Engage server** (same as Option 1, step 5)

---

### Option 3: Use WSL (Windows Subsystem for Linux)

If you have WSL installed:

```powershell
wsl redis-server
```

Keep this window open, then restart Engage server.

---

## 🚀 Quick Start Script

I created a script to help:

```powershell
.\START_REDIS_SIMPLE.ps1
```

This will:
- Check if Docker is running
- Start Redis container
- Verify it's working

---

## ✅ After Redis is Running

1. **Restart Engage Server:**
   ```powershell
   cd backend
   npm run start:engage
   ```

2. **You should see:**
   ```
   [REDIS] ✅ Connected to Redis
   🚀 ENGAGE Socket.IO Server Running
   Port: 3002
   ```

3. **Test Chess:**
   - Refresh your app
   - Go to Chess
   - Click "Create New Game"
   - Should work! ✅

---

## 📋 What I Changed

I updated `engage-server.js` to:
- ✅ Not crash if Redis isn't available
- ✅ Show helpful error messages
- ✅ Continue running (but features won't work)

**But you still need Redis for Chess to work!**

---

## 🎯 Summary

**You need:**
1. ✅ Docker Desktop running
2. ✅ Redis container started
3. ✅ Engage server restarted

**Quick commands:**
```powershell
# 1. Start Redis (after Docker Desktop is running)
docker run -d -p 6379:6379 --name redis-skipon redis:latest

# 2. Verify
redis-cli ping

# 3. Restart Engage server
cd backend
npm run start:engage
```

---

## ⚠️ If Docker Won't Start

1. **Check Docker Desktop is installed:**
   - Download: https://www.docker.com/products/docker-desktop

2. **Check Windows requirements:**
   - WSL 2 must be enabled
   - Virtualization must be enabled in BIOS

3. **Alternative:** Use Option 2 (Redis for Windows) - no Docker needed

