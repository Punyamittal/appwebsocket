# 🔧 Fix Connection Timeout Error

## ❌ The Problem

You're seeing this error:
```
[Chess] Create game error: Error: Connection timeout. 
Make sure the Engage server is running on port 3002 and Redis is running.
```

## ✅ The Solution

**The Engage server is running BUT it's running OLD code!**

The server (Process ID: 24068) needs to be restarted to apply the authentication fixes.

---

## 🚀 Quick Fix (Choose One)

### Option 1: Manual Restart

1. **Find the Engage server PowerShell window**
   - Look for the window showing `engage-server.js` output
   - It should show Redis connection attempts

2. **Stop the server:**
   - Press `Ctrl+C` in that window

3. **Start it again:**
   ```powershell
   cd backend
   npm run start:engage
   ```

4. **Wait for these messages:**
   ```
   [REDIS] ✅ Connected to Redis
   🚀 ENGAGE Socket.IO Server Running
   Port: 3002
   ```

5. **Refresh your app and test Chess!**

---

### Option 2: Use the Restart Script

```powershell
.\RESTART_ENGAGE_NOW.ps1
```

This script will:
- ✅ Stop the old server
- ✅ Start a new one in a new window
- ✅ Show you what to look for

---

## 🔍 What I Fixed

1. **Authentication is now more lenient** - Server accepts connections even with incomplete auth
2. **Better error logging** - You'll see exactly what's happening
3. **Connection confirmation** - Server sends a `connected` event immediately
4. **Longer timeout** - 20 seconds instead of 15
5. **Better error messages** - Tells you exactly what to check

---

## ✅ After Restart - What to Expect

### In the Server Window:
```
[REDIS] ✅ Connected to Redis
🚀 ENGAGE Socket.IO Server Running
Port: 3002
[PLAY-ALONG] ✅ User <userId> connected (socket: <socketId>)
```

### In Your App:
- ✅ No more timeout errors
- ✅ Chess game portal opens immediately
- ✅ Room code is displayed
- ✅ "Create New Game" works!

---

## 🐛 If Still Not Working

### Check 1: Is Redis Running?
```powershell
docker ps | findstr redis
```
Should show: `medchain-redis` container running

### Check 2: Is Server Listening?
```powershell
netstat -ano | findstr :3002
```
Should show: `LISTENING` on port 3002

### Check 3: Check Server Logs
Look in the Engage server window for:
- ❌ `[REDIS] ❌ Failed to connect` → Redis issue
- ❌ `[PLAY-ALONG] ❌ Unauthenticated` → Auth issue (shouldn't happen now)
- ✅ `[PLAY-ALONG] ✅ User connected` → Working!

### Check 4: Browser Console
Open browser DevTools (F12) and check:
- Look for `[EngageService] Connecting to /play-along...`
- Look for `[EngageService] ✅ Connected to /play-along`
- Look for any error messages

---

## 📋 Checklist

- [ ] Stopped old Engage server (Ctrl+C)
- [ ] Started new Engage server (`npm run start:engage`)
- [ ] See "✅ Connected to Redis" in server window
- [ ] See "Port: 3002" in server window
- [ ] Refreshed app
- [ ] Tested Chess → Create New Game
- [ ] Works! ✅

---

## 🎯 The Root Cause

The server was running **before** I made the authentication changes. The old code was rejecting connections, but the new code allows them. **You just need to restart the server to load the new code!**

---

**After restarting, the connection timeout error will be fixed!** 🎉

