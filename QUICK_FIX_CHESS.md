# Quick Fix for Chess Connection Timeout

## ✅ What I Just Did

1. ✅ **Installed backend dependencies** - `npm install` completed
2. ✅ **Started Redis** - Docker container started
3. ✅ **Started Engage Server** - New PowerShell window opened

## 🎯 What You Should See

### New PowerShell Window
You should see a new PowerShell window that says:
```
🚀 ENGAGE Socket.IO Server Running
Port: 3002
Max Connections: 2000
Optimized for: 1000+ concurrent users
```

### If You See Errors

**"Redis connection error"**
- Redis may still be starting (wait 5-10 seconds)
- Or run: `docker start redis-skipon`

**"Cannot find module"**
- Dependencies are installed, but if you see this:
  ```powershell
  cd backend
  npm install
  ```

## ✅ Verify Everything is Running

### Check Port 3001 (FastAPI Backend)
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/" -UseBasicParsing
# Should return: {"message": "Skip On API", "version": "1.0.0"}
```

### Check Port 3002 (Engage Server)
```powershell
Invoke-WebRequest -Uri "http://localhost:3002" -UseBasicParsing
# Should return HTML or connection successful
```

### Check Redis
```powershell
redis-cli ping
# Should return: PONG
```

## 🎮 Test Chess Now

1. **Refresh your app** (or restart Expo)
2. Go to **Chess** feature
3. Click **"Create New Game"**
4. Should work! ✅

## 📋 Summary

**What's Running:**
- ✅ FastAPI Backend (port 3001) - Already running
- ✅ Redis (port 6379) - Just started
- ✅ Engage Server (port 3002) - Just started in new window

**What You Need:**
- Keep all 3 running while using the app
- The new PowerShell window must stay open (that's the Engage server)

## 🚨 If Still Not Working

1. **Check the Engage server window** - Look for errors
2. **Check Redis**: `docker ps` - Should see redis-skipon container
3. **Check ports**: `netstat -ano | findstr ":3002"`
4. **Restart everything**: Close all, then run `.\START_ALL_SERVERS.ps1`

## 🎯 Next Time

To start everything quickly:
```powershell
.\START_ALL_SERVERS.ps1
```

This will check and start all servers automatically.

