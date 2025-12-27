# Skip On Setup Guide - Get It Working Now

## What Skip On Needs

Skip On uses **REST API + Firebase Realtime Database**:
- **Matchmaking**: REST API (`/api/skip/match`, `/api/skip/leave`, `/api/skip/status`)
- **Chat Messages**: Firebase Realtime Database

---

## ✅ Step 1: Start Backend Server (REQUIRED)

The backend must be running for matchmaking to work.

```powershell
cd "C:\Users\punya mittal\app\backend"
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

**Verify it's running:**
- Open: http://localhost:3001/api/
- Should see: `{"message": "Skip On API", "version": "1.0.0"}`

---

## ✅ Step 2: Configure Firebase Realtime Database (REQUIRED)

Skip On needs Firebase Realtime Database for chat messages.

### Option A: Use Existing Firebase Project

1. **Enable Realtime Database** in Firebase Console:
   - Go to: https://console.firebase.google.com/
   - Select project: `gingr-13c0c`
   - Go to: **Realtime Database** → **Create Database**
   - Choose location (e.g., `us-central1`)
   - Start in **test mode** (for development)

2. **Get Database URL**:
   - After creating, you'll see: `https://gingr-13c0c-default-rtdb.firebaseio.com/`
   - Copy this URL

3. **Update Firebase Config**:
   - Edit `frontend/services/firebase.ts`
   - Uncomment and set `databaseURL`:
   ```typescript
   databaseURL: 'https://gingr-13c0c-default-rtdb.firebaseio.com/'
   ```

4. **Set Security Rules** (for development):
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

### Option B: Use Environment Variables

Add to `frontend/app.json`:
```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_FIREBASE_DATABASE_URL": "https://gingr-13c0c-default-rtdb.firebaseio.com/"
    }
  }
}
```

---

## ✅ Step 3: Verify Frontend Configuration

### Check API Base URL

The frontend needs to know where the backend is.

**Check `frontend/services/api.ts`:**
- Should point to: `http://localhost:3001` (or your backend URL)
- For mobile devices: Use your computer's IP (e.g., `http://192.168.1.100:3001`)

### Check Firebase Config

**Check `frontend/services/firebase.ts`:**
- `databaseURL` should be set
- Firebase project should be `gingr-13c0c`

---

## ✅ Step 4: Test Skip On

1. **Start Backend** (if not running):
   ```powershell
   cd backend
   python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
   ```

2. **Start Frontend**:
   ```powershell
   cd frontend
   npm start
   ```

3. **Test Flow**:
   - Open app → Go to "Chat On"
   - Click "Start Chat"
   - Should see "Searching for partner..."
   - Open another instance/device
   - Click "Start Chat" again
   - Should match immediately!

---

## 🚨 Troubleshooting

### "Failed to join matchmaking"
- ✅ Backend server is running?
- ✅ Backend URL is correct in `api.ts`?
- ✅ Check backend logs for errors

### "Firebase Database not initialized"
- ✅ Firebase Realtime Database is created?
- ✅ `databaseURL` is set in `firebase.ts`?
- ✅ Firebase project ID is correct?

### "Cannot connect to backend"
- ✅ Backend is running on port 3001?
- ✅ For mobile: Use computer's IP, not `localhost`
- ✅ Check firewall isn't blocking port 3001

### Messages not sending/receiving
- ✅ Firebase Realtime Database is enabled?
- ✅ Security rules allow read/write?
- ✅ Check Firebase Console → Realtime Database for messages

---

## 📋 Quick Checklist

- [ ] Backend server running on port 3001
- [ ] Firebase Realtime Database created
- [ ] `databaseURL` set in `firebase.ts`
- [ ] Firebase security rules configured
- [ ] Backend URL correct in `api.ts`
- [ ] Frontend can connect to backend
- [ ] Test with 2 devices/instances

---

## 🔧 Quick Fixes

### Fix Firebase Database URL

Edit `frontend/services/firebase.ts`:
```typescript
const firebaseConfig = {
  // ... existing config ...
  databaseURL: 'https://gingr-13c0c-default-rtdb.firebaseio.com/', // ADD THIS
};
```

### Fix Backend URL for Mobile

Edit `frontend/services/api.ts`:
```typescript
// For Android emulator:
const baseURL = 'http://10.0.2.2:3001';

// For real device (replace with your computer's IP):
const baseURL = 'http://192.168.1.100:3001';

// For iOS simulator:
const baseURL = 'http://localhost:3001';
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

## 📖 More Info

- **Backend API**: `backend/server.py` (lines 763-960)
- **Frontend Service**: `frontend/services/skipOnService.new.ts`
- **REST Service**: `frontend/services/skipOnRESTService.ts`
- **Firebase Service**: `frontend/services/skipOnFirebaseService.ts`

