# Troubleshooting SkipOn Chat Not Starting

## Problem
You can't start a chat in SkipOn - clicking "Start Chat" doesn't work.

## Common Issues & Solutions

### Issue 1: Backend Server Not Running Properly ✅

**Symptoms:**
- Endpoint `/api/skip/match` returns 404
- Multiple processes on port 3001 (conflicts)

**Solution:**
1. **Stop all existing backend servers:**
   ```powershell
   # Find all Python processes
   Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
   
   # Or find processes on port 3001
   netstat -ano | findstr ":3001"
   # Note the PIDs, then stop them:
   Stop-Process -Id <PID> -Force
   ```

2. **Start backend server correctly:**
   ```powershell
   cd "C:\Users\punya mittal\app1\app\backend"
   python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
   ```

3. **Verify it's running:**
   ```powershell
   # Test root endpoint
   curl http://localhost:3001/api/
   # Should return: {"message": "Skip On API", "version": "1.0.0"}
   
   # Test skip/match endpoint
   curl -X POST http://localhost:3001/api/skip/match -H "Content-Type: application/json" -d '{\"guestId\": \"test123\"}'
   # Should return: {"status": "searching"} or {"status": "matched", ...}
   ```

---

### Issue 2: Multiple Backend Servers Running (Port Conflict) ⚠️

**Symptoms:**
- Multiple processes listening on port 3001
- Intermittent 404 errors
- Server crashes

**Solution:**
```powershell
# Kill all processes on port 3001
$processes = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $processes) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

# Wait a moment
Start-Sleep -Seconds 2

# Start fresh server
cd "C:\Users\punya mittal\app1\app\backend"
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

---

### Issue 3: Frontend Can't Connect to Backend 🔌

**Symptoms:**
- Browser console shows connection errors
- "Failed to join matchmaking" error

**Solution:**

1. **Check backend URL in frontend:**
   - File: `app\frontend\services\api.ts`
   - Should be: `http://localhost:3001` (for web)
   - For mobile: Use your computer's IP address

2. **Test backend connectivity:**
   ```powershell
   # From browser console (F12):
   fetch('http://localhost:3001/api/')
     .then(r => r.json())
     .then(console.log)
   ```

3. **Check CORS (if accessing from different origin):**
   - Backend should have CORS enabled (already configured)
   - Check browser console for CORS errors

---

### Issue 4: Firebase Not Configured 🔥

**Symptoms:**
- Chat starts but messages don't send/receive
- Firebase errors in console

**Solution:**

1. **Check Firebase configuration:**
   - File: `app\frontend\services\firebase.ts`
   - Line 36: Should have `databaseURL` set
   - Should be: `https://gingr-13c0c-default-rtdb.asia-southeast1.firebasedatabase.app/`

2. **Verify Firebase Realtime Database:**
   - Go to: https://console.firebase.google.com/
   - Project: `gingr-13c0c`
   - Check: Realtime Database is enabled
   - Check: Security rules allow read/write

---

### Issue 5: Service Import Mismatch 🔄

**Symptoms:**
- Import errors in console
- "Service not found" errors

**Solution:**

The frontend uses `skipOnService.new.ts` which uses REST + Firebase:
- File: `app\frontend\app\home\chat-on.tsx`
- Line 28: `import skipOnService, { ChatMessage as SkipOnMessage } from '../../services/skipOnService.new';`

Make sure this file exists and is correct.

---

## Quick Diagnostic Checklist

Run these checks:

```powershell
# 1. Check if backend is running
curl http://localhost:3001/api/
# Expected: {"message": "Skip On API", "version": "1.0.0"}

# 2. Test skip/match endpoint
$body = @{ guestId = "test123" } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:3001/api/skip/match" -Method POST -ContentType "application/json" -Body $body
# Expected: {"status": "searching"} or {"status": "matched", ...}

# 3. Check how many processes on port 3001
netstat -ano | findstr ":3001" | Measure-Object
# Expected: Should see 1-2 processes (not 9!)

# 4. Check frontend console (F12 in browser)
# Look for:
# - Network errors
# - Console errors
# - Firebase errors
```

---

## Step-by-Step Fix

1. **Stop all backend servers:**
   ```powershell
   Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

2. **Start backend cleanly:**
   ```powershell
   cd "C:\Users\punya mittal\app1\app\backend"
   python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
   ```

3. **Wait for server to start** (look for: "Uvicorn running on http://0.0.0.0:3001")

4. **Test the endpoint:**
   ```powershell
   $body = @{ guestId = "test123" } | ConvertTo-Json
   Invoke-WebRequest -Uri "http://localhost:3001/api/skip/match" -Method POST -ContentType "application/json" -Body $body
   ```

5. **Start frontend:**
   ```powershell
   cd "C:\Users\punya mittal\app1\app\frontend"
   npm start
   ```

6. **Test in browser:**
   - Open: http://localhost:8081
   - Navigate to "Chat On"
   - Click "Start Chat"
   - Check browser console (F12) for errors

---

## Expected Behavior

When working correctly:

1. **Click "Start Chat"**
   - State changes to "searching"
   - Shows "Connecting..." message
   - Calls `POST /api/skip/match`

2. **Backend response:**
   - First user: `{ status: "searching" }`
   - Second user: `{ status: "matched", roomId: "...", partnerId: "..." }`

3. **When matched:**
   - State changes to "chatting"
   - Firebase room is initialized
   - Chat interface appears

---

## Still Not Working?

Check browser console (F12) for:
- Network tab → See if request to `/api/skip/match` is made
- Console tab → Look for JavaScript errors
- Errors about Firebase
- Errors about backend connection

Check backend logs for:
- Server startup messages
- Request logs when you click "Start Chat"
- Any error messages

---

**Need more help?** Check the backend terminal output when you click "Start Chat" - it should show request logs.



