# Fix Firebase Realtime Database Connection Error

## Problem
Firebase Realtime Database is showing `ERR_CONNECTION_REFUSED` errors, preventing SkipOn chat messages from working.

## Status
✅ **Matching is now working!** Both users are getting matched to the same room.
❌ **Firebase connection is failing** - messages can't be sent/received.

## Possible Causes

### 1. Firebase Realtime Database Not Enabled
The most common cause is that Firebase Realtime Database is not enabled in your Firebase project.

**To check and enable:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `gingr-13c0c`
3. Go to **Build** → **Realtime Database**
4. If you see "Get started", click it to create the database
5. Choose a location (e.g., `asia-southeast1` - matches your URL)
6. Choose **Start in test mode** (for development)
7. Click **Enable**

### 2. Database Rules Blocking Access
Even if the database is enabled, security rules might be blocking access.

**To check rules:**
1. Go to Firebase Console → Realtime Database → **Rules** tab
2. For development, use these rules:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
3. Click **Publish**

⚠️ **Warning:** These rules allow anyone to read/write. Only use for development!

### 3. Wrong Database URL
The database URL in the code is:
```
https://gingr-13c0c-default-rtdb.asia-southeast1.firebasedatabase.app/
```

**To verify:**
1. Go to Firebase Console → Realtime Database
2. Check the URL shown at the top
3. It should match the URL in `app.json` (now added)

### 4. Network/Firewall Issues
If you're behind a firewall or corporate network, it might be blocking Firebase connections.

**To test:**
- Try from a different network
- Check if other Firebase services (Auth) work

## What I Fixed

1. ✅ Added `EXPO_PUBLIC_FIREBASE_DATABASE_URL` to `app.json`
   - This ensures the database URL is properly configured
   - The URL was hardcoded in `firebase.ts` but not in config

## Next Steps

1. **Restart the frontend** to pick up the new config:
   ```powershell
   # Stop the frontend (Ctrl+C)
   # Then restart:
   cd app\frontend
   npm start
   ```

2. **Verify Firebase Realtime Database is enabled:**
   - Go to Firebase Console
   - Check if Realtime Database exists
   - If not, enable it (see steps above)

3. **Check database rules:**
   - Make sure rules allow read/write for development
   - Publish the rules

4. **Test the connection:**
   - Open browser console
   - Look for: `🔌 SkipOnFirebase: Connection status: CONNECTED`
   - If you see `DISCONNECTED` or errors, check the steps above

## Expected Behavior After Fix

Once Firebase is properly configured, you should see:
```
✅ SkipOnFirebaseService: Firebase Realtime Database initialized
✅ SkipOnFirebaseService: Database URL: https://gingr-13c0c-default-rtdb.asia-southeast1.firebasedatabase.app/
🔌 SkipOnFirebase: Connection status: CONNECTED
```

And the `ERR_CONNECTION_REFUSED` errors should stop.

## Alternative: Use Backend for Messages (If Firebase Can't Be Fixed)

If Firebase Realtime Database can't be enabled, we could modify the backend to handle messages via WebSocket or REST API instead. But Firebase is the preferred solution for real-time chat.

---

**The matching issue is fixed! Now we just need to fix the Firebase connection so messages work.** 🎉



