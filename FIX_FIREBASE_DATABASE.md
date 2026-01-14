# Fix Firebase Realtime Database Connection

## Problem
Firebase Realtime Database is showing `ERR_CONNECTION_REFUSED` errors:
```
WebSocket connection to 'wss://s-apse1a-nss-2001.asia-southeast1.firebasedatabase.app/.ws' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
GET https://gingr-13c0c-default-rtdb.asia-southeast1.firebasedatabase.app/.lp net::ERR_CONNECTION_REFUSED
```

## Solution: Enable Firebase Realtime Database

### Step 1: Go to Firebase Console
1. Open https://console.firebase.google.com/
2. Select your project: **gingr-13c0c**

### Step 2: Enable Realtime Database
1. In the left sidebar, click **"Realtime Database"** (or **"Build" → "Realtime Database"**)
2. If you see "Get started", click it
3. Choose **"Asia-Southeast1 (asia-southeast1)"** as the region (matches your URL)
4. Click **"Enable"**

### Step 3: Set Database Rules
1. Go to **"Realtime Database"** → **"Rules"** tab
2. Set these rules (for development/testing):
```json
{
  "rules": {
    "skipOnRooms": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    ".read": false,
    ".write": false
  }
}
```

**For production**, use more restrictive rules:
```json
{
  "rules": {
    "skipOnRooms": {
      "$roomId": {
        ".read": "auth != null && (root.child('skipOnRooms').child($roomId).child('users').child(auth.uid).exists() || root.child('skipOnRooms').child($roomId).child('users').hasChildren())",
        ".write": "auth != null && (root.child('skipOnRooms').child($roomId).child('users').child(auth.uid).exists() || root.child('skipOnRooms').child($roomId).child('users').hasChildren())",
        "messages": {
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }
}
```

3. Click **"Publish"**

### Step 4: Verify Database URL
1. Go to **"Realtime Database"** → **"Data"** tab
2. At the top, you should see the database URL
3. It should match: `https://gingr-13c0c-default-rtdb.asia-southeast1.firebasedatabase.app/`
4. If it's different, update `app/frontend/app.json`:
```json
"EXPO_PUBLIC_FIREBASE_DATABASE_URL": "YOUR_ACTUAL_DATABASE_URL"
```

### Step 5: Restart Frontend
After enabling the database:
```powershell
# Stop the frontend (Ctrl+C)
# Then restart:
cd app/frontend
npm start
```

## Verify It's Working

After restarting, check the browser console. You should see:
```
✅ SkipOnFirebaseService: Firebase Realtime Database initialized
✅ SkipOnFirebaseService: Database URL: https://gingr-13c0c-default-rtdb.asia-southeast1.firebasedatabase.app/
🔌 SkipOnFirebase: Connection status: CONNECTED
```

Instead of the `ERR_CONNECTION_REFUSED` errors.

## Current System Status

✅ **Matching System**: Works (uses backend/Redis) - **NOT affected by Firebase**
- Users can still match via `/api/skip/match`
- Room creation works via backend
- Matching logic is independent of Firebase

❌ **Chat Messages**: Requires Firebase Realtime Database
- Chat messages are stored in Firebase
- Video call signaling works via Socket.IO (independent of Firebase)

## Quick Test

1. **Test Matching** (should work even without Firebase):
   - Open two browsers
   - Both click "Start Chat"
   - They should match (check backend logs)
   - But chat messages won't work until Firebase is enabled

2. **Test Firebase Connection**:
   - After enabling Firebase, try sending a message
   - Check browser console for connection status
   - Messages should appear in Firebase Console → Realtime Database → Data

## Alternative: Use Firestore Instead

If Realtime Database continues to have issues, you can switch to Firestore:
1. Go to Firebase Console → **"Firestore Database"**
2. Enable it
3. Update the code to use Firestore instead of Realtime Database

But for now, **Realtime Database is the recommended solution** for SkipOn chat.



