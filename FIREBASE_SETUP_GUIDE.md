# Firebase Setup Guide for Skip On

## ✅ Required Steps in Firebase Console

### 1. Enable Firebase Realtime Database

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **gingr-13c0c**
3. In the left sidebar, click **"Realtime Database"**
4. Click **"Create Database"** (if not already created)
5. Choose a location (e.g., `us-central1` or closest to your users)
6. Choose **"Start in test mode"** (we'll add security rules next)

### 2. Get Database URL (Optional)

The Firebase SDK should automatically use the default database URL, but if you need it:

1. In Realtime Database page
2. Look for **"Database URL"** at the top
3. It should be: `https://gingr-13c0c-default-rtdb.firebaseio.com/` (or similar)

**Note:** You don't need to add this to your code - the SDK handles it automatically.

### 3. Set Up Security Rules (CRITICAL)

1. In Realtime Database page, click **"Rules"** tab
2. Replace the default rules with this:

```json
{
  "rules": {
    "skipOnRooms": {
      "$roomId": {
        // Only users in the room can read/write
        ".read": "data.child('users').child(auth.uid).exists() || root.child('skipOnRooms').child($roomId).child('users').hasChild($userId)",
        ".write": "data.child('users').child(auth.uid).exists() || root.child('skipOnRooms').child($roomId).child('users').hasChild($userId)",
        
        "users": {
          ".read": true,
          ".write": "data.child(auth.uid).exists() || !data.exists()"
        },
        
        "messages": {
          ".read": "data.parent().child('users').child(auth.uid).exists()",
          "$messageId": {
            ".write": "newData.child('senderId').val() === auth.uid",
            ".validate": "newData.hasChildren(['senderId', 'text', 'timestamp']) && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 500"
          }
        },
        
        "status": {
          ".read": true,
          ".write": "data.parent().child('users').child(auth.uid).exists()"
        }
      }
    }
  }
}
```

**⚠️ IMPORTANT:** The above rules require authentication. Since Skip On supports **guest users**, we need to allow unauthenticated access. Use this instead:

```json
{
  "rules": {
    "skipOnRooms": {
      "$roomId": {
        // Allow read/write if user is in the room's users list
        // For guest users, we check the userId in the request
        ".read": "data.child('users').hasChild($userId) || root.child('skipOnRooms').child($roomId).child('users').hasChild($userId)",
        ".write": "data.child('users').hasChild($userId) || root.child('skipOnRooms').child($roomId).child('users').hasChild($userId)",
        
        "users": {
          ".read": true,
          ".write": true
        },
        
        "messages": {
          ".read": true,
          "$messageId": {
            ".write": true,
            ".validate": "newData.hasChildren(['senderId', 'text', 'timestamp']) && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 500"
          }
        },
        
        "status": {
          ".read": true,
          ".write": true
        }
      }
    },
    "watchAlongRooms": {
      "$roomId": {
        // Allow read/write for Watch Along rooms
        // For development: open access (will be restricted in production)
        ".read": true,
        ".write": true,
        
        "messages": {
          ".read": true,
          "$messageId": {
            ".write": true,
            ".validate": "newData.hasChildren(['senderId', 'text', 'timestamp']) && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 500"
          }
        }
      }
    }
  }
}
```

**⚠️ SECURITY NOTE:** The above rules allow open access for development. For production, you should:

1. **Option A: Use Firebase Authentication** (Recommended)
   - Authenticate all users (including guests) with Firebase Auth
   - Use `auth.uid` in security rules
   - More secure, but requires auth setup

2. **Option B: Use Custom Tokens** (Advanced)
   - Generate custom tokens for guest users
   - Validate tokens in security rules
   - More complex but secure

3. **Option C: Backend Validation** (Current approach)
   - Keep open rules for development
   - Validate all writes via your backend REST API
   - Add rate limiting and validation
   - Less secure but simpler

**For now, use the open rules above to get it working, then tighten security later.**

### 4. Publish Rules

1. After pasting the rules, click **"Publish"**
2. Rules take effect immediately

## 🔍 Verify Setup

1. **Check Database URL:**
   - Go to Realtime Database → Data tab
   - Should see empty database (or existing data)

2. **Test Rules:**
   - Try creating a test room manually
   - Should work if rules are correct

3. **Check Console Logs:**
   - When app runs, look for: `✅ SkipOnFirebaseService: Firebase Realtime Database initialized`
   - If you see errors, check Firebase config in `app.json`

## 📋 Quick Checklist

- [ ] Realtime Database enabled
- [ ] Security rules configured and published
- [ ] Database URL noted (optional)
- [ ] Tested with app (create a room)

## 🚨 Common Issues

### "Permission denied" error
- **Fix:** Check security rules are published
- **Fix:** Verify user is in room's `users` list

### "Database not initialized" error
- **Fix:** Check Firebase config in `app.json`
- **Fix:** Verify `EXPO_PUBLIC_FIREBASE_PROJECT_ID` is correct

### Messages not appearing
- **Fix:** Check browser console for Firebase errors
- **Fix:** Verify security rules allow read access
- **Fix:** Check Firebase Realtime Database is enabled (not Firestore)

## 📚 Additional Resources

- [Firebase Realtime Database Docs](https://firebase.google.com/docs/database)
- [Security Rules Guide](https://firebase.google.com/docs/database/security)
- [Firebase Console](https://console.firebase.google.com/)

---

**Status:** Follow steps 1-3 above, then test the app!

