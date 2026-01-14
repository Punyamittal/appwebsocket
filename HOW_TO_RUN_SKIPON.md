# How to Run SkipOn Feature

SkipOn (also called "Chat On") is an anonymous chat matching feature that uses REST API + Firebase Realtime Database.

## ✅ Quick Start

### Option 1: Use PowerShell Script (Recommended)

```powershell
cd app
.\START_SKIP_ON.ps1
```

This script will:
- Check if backend is running
- Start backend if needed
- Check Firebase configuration
- Give you next steps

---

### Option 2: Manual Setup

#### Step 1: Start Backend Server (REQUIRED)

Open PowerShell and run:

```powershell
cd app\backend
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

**Verify it's running:**
- Open: http://localhost:3001/api/
- Should see: `{"message": "Skip On API", "version": "1.0.0"}`

**Or test with curl:**
```powershell
curl http://localhost:3001/api/
```

---

#### Step 2: Configure Firebase Realtime Database (REQUIRED)

SkipOn needs Firebase Realtime Database for chat messages.

**Current Firebase Config:**
- Project: `gingr-13c0c`
- Database URL: `https://gingr-13c0c-default-rtdb.asia-southeast1.firebasedatabase.app/`

**Check if configured:**
1. Open: `app\frontend\services\firebase.ts`
2. Look for `databaseURL` (line 36)
3. Should be set to: `https://gingr-13c0c-default-rtdb.asia-southeast1.firebasedatabase.app/`

**If not configured, do this:**
1. Go to: https://console.firebase.google.com/
2. Select project: `gingr-13c0c`
3. Go to: **Realtime Database** → **Create Database** (if not already created)
4. Choose location: `asia-southeast1` (or your preferred region)
5. Start in **test mode** for development

**Update security rules:**
```json
{
  "rules": {
    "skipOnRooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

---

#### Step 3: Start Frontend

Open a new PowerShell window:

```powershell
cd app\frontend
npm start
```

**Options:**
- Press `w` to open in web browser
- Press `i` for iOS simulator (macOS only)
- Press `a` for Android emulator
- Scan QR code with Expo Go app on your phone

---

## 🎯 Testing SkipOn

1. **Open the app** → Navigate to **"Chat On"** or **"Skip On"** tab
2. **Click "Start Chat"** or **"Begin Matching"**
3. **Should see:** "Searching for partner..." or "Waiting for match..."
4. **To test matching:**
   - Open another instance/device/browser tab
   - Click "Start Chat" again
   - Should match immediately!

---

## 📋 Requirements Checklist

- [ ] Backend server running on port 3001
- [ ] Firebase Realtime Database enabled
- [ ] `databaseURL` set in `frontend/services/firebase.ts`
- [ ] Firebase security rules configured
- [ ] Frontend running (Expo)
- [ ] Backend URL correct in `frontend/services/api.ts` (default: `http://localhost:3001`)

---

## 🔧 Configuration Files

### Backend API URL
**File:** `app\frontend\services\api.ts`
- Default: `http://localhost:3001`
- For mobile devices: Use your computer's IP (e.g., `http://192.168.1.100:3001`)
- For Android emulator: `http://10.0.2.2:3001`
- For iOS simulator: `http://localhost:3001`

### Firebase Config
**File:** `app\frontend\services\firebase.ts`
- Line 36: `databaseURL` should be set
- Should match your Firebase project's Realtime Database URL

---

## 🚨 Troubleshooting

### "Failed to join matchmaking"
- ✅ Backend server is running on port 3001?
- ✅ Backend URL is correct in `api.ts`?
- ✅ Check backend logs for errors
- ✅ Test backend: `curl http://localhost:3001/api/`

### "Firebase Database not initialized"
- ✅ Firebase Realtime Database is created?
- ✅ `databaseURL` is set in `firebase.ts`?
- ✅ Firebase project ID is `gingr-13c0c`?
- ✅ Check Firebase Console → Realtime Database

### "Cannot connect to backend"
- ✅ Backend is running on port 3001?
- ✅ For mobile: Use computer's IP, not `localhost`
- ✅ Check firewall isn't blocking port 3001
- ✅ Test: `curl http://localhost:3001/api/`

### Messages not sending/receiving
- ✅ Firebase Realtime Database is enabled?
- ✅ Security rules allow read/write?
- ✅ Check Firebase Console → Realtime Database for messages
- ✅ Check browser console for errors

---

## 📖 API Endpoints Used

SkipOn uses these REST API endpoints:

- `POST /api/skip/match` - Join matchmaking queue
- `POST /api/skip/leave` - Leave current room
- `GET /api/skip/status` - Get match status

**Test endpoints:**
```powershell
# Test match endpoint
curl -X POST http://localhost:3001/api/skip/match `
  -H "Content-Type: application/json" `
  -d '{\"guestId\": \"test123\"}'
```

---

## 🎯 Expected Behavior

1. **User clicks "Start Chat"**
   - Calls `POST /api/skip/match`
   - If queue empty → Returns `{ status: "searching" }`
   - If queue has user → Returns `{ status: "matched", roomId, partnerId }`

2. **When matched**
   - Initializes Firebase room
   - Subscribes to Firebase messages
   - Shows chat interface

3. **Sending message**
   - Saves to Firebase Realtime Database
   - Both users receive via Firebase listener

4. **Skip/Leave**
   - Calls `POST /api/skip/leave`
   - Marks room as ended in Firebase
   - Starts new search

---

## 📚 Related Files

- **Backend API**: `app\backend\server.py` (SkipOn endpoints)
- **Frontend Service**: `app\frontend\services\skipOnService.ts`
- **REST Service**: `app\frontend\services\skipOnRESTService.ts`
- **Firebase Service**: `app\frontend\services\skipOnFirebaseService.ts`
- **UI Component**: `app\frontend\app\home\chat-on.tsx`

---

## 🚀 Quick Command Summary

```powershell
# 1. Start Backend (Terminal 1)
cd app\backend
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload

# 2. Start Frontend (Terminal 2)
cd app\frontend
npm start

# 3. Test Backend
curl http://localhost:3001/api/
```

---

**That's it! SkipOn should now be working!** 🎉



