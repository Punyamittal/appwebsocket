# Quick Fix: SkipOn Chat Not Starting

## Problem
You can't start a chat in SkipOn because the Python FastAPI backend server is NOT running on port 3001.

**Current Situation:**
- Port 3001 is being used by Node.js (engage-server) - Process 18456
- The Python FastAPI backend server needs to run on port 3001 for SkipOn to work
- The `/api/skip/match` endpoint returns 404 because the Python server isn't running

## Solution

### Option 1: Use Different Port for Engage Server (Recommended)

The engage-server (Node.js) can run on port 3002, and the Python backend can use port 3001.

**Step 1: Make sure engage-server is on port 3002 (should already be)**

Check if engage-server is running:
```powershell
netstat -ano | findstr ":3002"
```

**Step 2: Stop Node.js process on port 3001**

```powershell
Stop-Process -Id 18456 -Force
```

**Step 3: Start Python Backend Server**

Open a NEW terminal window:

```powershell
cd "C:\Users\punya mittal\app1\app\backend"
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

Wait for:
```
INFO:     Uvicorn running on http://0.0.0.0:3001 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

**Step 4: Test the endpoint**

In another terminal:
```powershell
$body = @{ guestId = 'test123' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body
```

Should return: `{"status": "searching"}` (not 404!)

**Step 5: Test SkipOn in browser**

1. Start frontend (if not running):
   ```powershell
   cd "C:\Users\punya mittal\app1\app\frontend"
   npm start
   ```

2. Open: http://localhost:8081
3. Navigate to "Chat On"
4. Click "Start Chat"
5. Should work now! ✅

---

### Option 2: Quick One-Liner Fix

Run this to stop Node.js on port 3001 and start Python backend:

```powershell
# Stop Node.js on port 3001
Stop-Process -Id 18456 -Force -ErrorAction SilentlyContinue

# Start Python backend in new window
cd "C:\Users\punya mittal\app1\app\backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload"
```

---

## Verify It's Working

**Test 1: Root endpoint**
```powershell
curl http://localhost:3001/api/
```
Expected: `{"message": "Skip On API", "version": "1.0.0"}`

**Test 2: Skip/match endpoint**
```powershell
$body = @{ guestId = 'test123' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body
```
Expected: `{"status": "searching"}`

---

## Complete Setup (All Servers)

For SkipOn to work, you need:

1. **Python Backend (Port 3001)** - Required for SkipOn ✅
   ```powershell
   cd app\backend
   python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
   ```

2. **Engage Server (Port 3002)** - Optional (for other features)
   ```powershell
   cd app\backend
   node engage-server.js
   ```

3. **Frontend (Port 8081)** - Required ✅
   ```powershell
   cd app\frontend
   npm start
   ```

---

## Summary

**The Issue:** Node.js is on port 3001, but Python FastAPI needs to be on port 3001 for SkipOn.

**The Fix:** 
1. Stop Node.js process (PID 18456)
2. Start Python backend server on port 3001
3. Test the endpoint
4. SkipOn should work! 🎉

**Quick Command:**
```powershell
Stop-Process -Id 18456 -Force; cd "C:\Users\punya mittal\app1\app\backend"; Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload"
```



