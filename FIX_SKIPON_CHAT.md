# Fix SkipOn Chat - Quick Solution

## Problem
You can't start a chat in SkipOn - clicking "Start Chat" doesn't work.

## Root Cause
- Multiple backend servers running on port 3001 (conflicts)
- The `/api/skip/match` endpoint returns 404 Not Found
- Server isn't responding correctly

## Quick Fix

### Step 1: Stop All Backend Servers

```powershell
# Stop all Python processes
Get-Process python* -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait a moment
Start-Sleep -Seconds 2

# Check if port 3001 is free
netstat -ano | findstr ":3001"
```

### Step 2: Start Backend Server Correctly

**Open a NEW PowerShell terminal:**

```powershell
cd "C:\Users\punya mittal\app1\app\backend"
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

**Wait for this message:**
```
INFO:     Uvicorn running on http://0.0.0.0:3001 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

### Step 3: Test the Endpoint

**In another terminal, test:**

```powershell
$body = @{ guestId = 'test123' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body
```

**Expected response:**
```json
{
  "status": "searching"
}
```

Or if matched:
```json
{
  "status": "matched",
  "roomId": "...",
  "partnerId": "..."
}
```

### Step 4: Start Frontend

**Open another terminal:**

```powershell
cd "C:\Users\punya mittal\app1\app\frontend"
npm start
```

### Step 5: Test in Browser

1. Open: http://localhost:8081
2. Navigate to **"Chat On"** tab
3. Click **"Start Chat"**
4. Should see: "Connecting..." or "Searching for partner..."

---

## Verify Backend is Working

**Test 1: Root endpoint**
```powershell
curl http://localhost:3001/api/
```
Should return: `{"message": "Skip On API", "version": "1.0.0"}`

**Test 2: Skip/match endpoint**
```powershell
$body = @{ guestId = 'test123' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body
```
Should return: `{"status": "searching"}`

---

## Common Issues

### Issue: Still getting 404

**Solution:**
1. Make sure backend server is running (check terminal)
2. Make sure you're in the `backend` directory when starting
3. Check terminal for error messages
4. Try restarting the backend server

### Issue: Multiple servers running

**Solution:**
```powershell
# Kill all processes on port 3001
$processes = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $processes) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}
```

### Issue: Frontend can't connect

**Solution:**
1. Check browser console (F12) for errors
2. Make sure backend is running on port 3001
3. Check `frontend/services/api.ts` - backend URL should be `http://localhost:3001`

---

## Complete Command Sequence

```powershell
# Terminal 1: Backend Server
cd "C:\Users\punya mittal\app1\app\backend"
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload

# Terminal 2: Frontend (after backend is running)
cd "C:\Users\punya mittal\app1\app\frontend"
npm start
```

---

## Expected Behavior

✅ **When working correctly:**

1. Click "Start Chat"
   - State changes to "searching"
   - Shows "Connecting..." message
   - Browser console shows: `[SkipOnREST] 🚀 match() called`
   - Browser console shows: `✅ SkipOnREST: Match response received`

2. Backend receives request
   - Backend terminal shows: `🔍 Skip On: /skip/match endpoint called`
   - Backend responds: `{"status": "searching"}` or `{"status": "matched", ...}`

3. When matched (2nd user joins)
   - State changes to "chatting"
   - Chat interface appears
   - Can send messages

---

**That's it! SkipOn chat should now work!** 🎉



