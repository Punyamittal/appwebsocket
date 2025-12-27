# ✅ Connection Verification Checklist

## Step 1: Kill All Server Instances

```powershell
# Run the fix script
.\FIX_TIMEOUT_NOW.ps1

# OR manually:
Stop-Process -Id 24068 -Force -ErrorAction SilentlyContinue
Stop-Process -Id 32988 -Force -ErrorAction SilentlyContinue

# Verify port is free
netstat -ano | findstr :3002
# Should return NOTHING
```

---

## Step 2: Start ONE Server Instance

```powershell
cd backend
npm run start:engage
```

**Wait for:**
```
🚀 ENGAGE Socket.IO Server Running
Port: 3002
```

---

## Step 3: Verify Server is Running

```powershell
# Check only ONE process
netstat -ano | findstr :3002
# Should show ONLY ONE process

# Test health endpoint
# Open in browser: http://localhost:3002/health
# Should return: {"status": "ok", ...}
```

---

## Step 4: Test Socket.IO Connection

### **Option A: Browser Console**

1. Open your app in browser
2. Open DevTools (F12)
3. Go to Console tab
4. Click "Create New Game"
5. Look for:
   ```
   [EngageService] Connecting to /play-along at http://localhost:3002/play-along...
   [EngageService] ✅ Server ready for /play-along: {...}
   [EngageService] ✅ Connected to /play-along
   ```

### **Option B: Server Logs**

In the server window, you should see:
```
[PLAY-ALONG] ✅ User <userId> connected (socket: <socketId>)
```

---

## Step 5: Verify Connection Success

**Success Indicators:**
- ✅ `[EngageService] ✅ Connected to /play-along` in browser console
- ✅ `[PLAY-ALONG] ✅ User connected` in server logs
- ✅ Chess portal opens immediately
- ✅ Room code appears

**Failure Indicators:**
- ❌ `Connection timeout` error
- ❌ No server logs on connection attempt
- ❌ Multiple processes on port 3002

---

## 🔧 If Still Timing Out

### **Check 1: Server Logs**
Look in server window for:
- `[PLAY-ALONG] ✅ User connected` → Server is working
- No logs → Server not receiving connections

### **Check 2: Browser Network Tab**
1. Open DevTools → Network tab
2. Filter: `WS` or `socket.io`
3. Click "Create New Game"
4. Look for WebSocket connection to `localhost:3002`
5. Check status: Should be `101 Switching Protocols`

### **Check 3: URL Construction**
In browser console, check:
```javascript
// Should log:
[EngageService] Connecting to /play-along at http://localhost:3002/play-along...
```

If URL is wrong, check `getBackendUrl()` function.

### **Check 4: CORS Issues**
Check browser console for CORS errors. Should not appear with current CORS config.

---

## ✅ Final Verification

After fixes, you should see:

1. **Only ONE server process** on port 3002
2. **Health endpoint works:** `http://localhost:3002/health`
3. **Connection succeeds** in < 2 seconds
4. **Server logs show:** `[PLAY-ALONG] ✅ User connected`
5. **Client logs show:** `[EngageService] ✅ Connected to /play-along`
6. **Chess portal opens** immediately
7. **Room code appears** instantly

---

**If all checks pass, the connection should work!** 🎉

