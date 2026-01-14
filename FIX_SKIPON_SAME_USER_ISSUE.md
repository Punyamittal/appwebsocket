# Fix SkipOn - Users Getting Different Rooms

## Problem
Both users are in different rooms and not getting matched. They're not in the same room.

## Root Cause
The backend matchmaking is working correctly, but the issue is likely:

1. **Both users have the SAME guestId** - Backend thinks they're the same user
2. **Frontend creating separate rooms** - Not using backend roomId correctly
3. **Timing issue** - Both users creating rooms before matching

## Solution

### Issue 1: Same Guest ID

**Symptom:** Both users get the same guestId, so backend treats them as the same user.

**Fix:** Make sure each user/browser tab gets a unique guestId.

**Check:**
1. Open browser console (F12) in both tabs
2. Check what guestId each user has:
   ```javascript
   // In browser console:
   import AsyncStorage from '@react-native-async-storage/async-storage';
   AsyncStorage.getItem('skip_on_guest_id').then(console.log);
   ```
3. If both have the SAME ID → That's the problem!

**Solution:**
- Guest IDs are stored in AsyncStorage/LocalStorage per browser/device
- Each browser tab/window should have a DIFFERENT guestId
- If testing in same browser, use different browsers OR clear storage:
  ```javascript
  // In browser console:
  localStorage.clear();
  // Then refresh page
  ```

### Issue 2: Testing with Same Browser/Device

**Problem:** If testing in the same browser (different tabs), they might share the same guestId.

**Solutions:**

1. **Use different browsers:**
   - Tab 1: Chrome
   - Tab 2: Firefox/Edge

2. **Use incognito/private windows:**
   - Tab 1: Normal window
   - Tab 2: Incognito window (different storage)

3. **Clear storage between tests:**
   ```javascript
   // In browser console (F12):
   localStorage.clear();
   sessionStorage.clear();
   // Then refresh
   ```

4. **Use different devices:**
   - Device 1: Computer browser
   - Device 2: Phone browser

### Issue 3: Verify Users Are Different

**Check backend logs:**
- When User 1 clicks "Start Chat", look for:
  ```
  🔍 Skip On: User ID: guest_abc123...
  ```
- When User 2 clicks "Start Chat", look for:
  ```
  🔍 Skip On: User ID: guest_xyz789...
  ```
- **They should be DIFFERENT!**

### Issue 4: Test with Different Guest IDs

**Manual test:**
```powershell
# Terminal 1: User 1
$body1 = @{ guestId = 'user1_unique_id' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body1

# Terminal 2: User 2 (different ID!)
$body2 = @{ guestId = 'user2_unique_id' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body2
```

**Expected:**
- User 1: `{"status": "searching"}`
- User 2: `{"status": "matched", "roomId": "...", "partnerId": "user1_unique_id"}`

Both should get the **SAME roomId**!

## Quick Fix Checklist

1. ✅ **Check backend is running** (one instance on port 3001)
2. ✅ **Verify different guestIds** (check browser console)
3. ✅ **Use different browsers/devices** (or incognito windows)
4. ✅ **Check backend logs** (see user IDs are different)
5. ✅ **Test with manual API calls** (different guestIds)

## Expected Behavior

**When working correctly:**

1. **User 1 (guestId: abc123)** clicks "Start Chat"
   - Backend: `🔍 Skip On: User ID: abc123`
   - Response: `{"status": "searching"}`

2. **User 2 (guestId: xyz789)** clicks "Start Chat"
   - Backend: `🔍 Skip On: User ID: xyz789`
   - Backend: `🔍 Skip On: Matching xyz789 with abc123`
   - Response: `{"status": "matched", "roomId": "skip_...", "partnerId": "abc123"}`

3. **Both users get the SAME roomId!** ✅

## Debug Steps

1. **Open browser console (F12)** in both tabs
2. **Check Network tab** → See requests to `/api/skip/match`
3. **Check Request body** → `guestId` should be DIFFERENT
4. **Check Response** → Both should get the SAME `roomId` when matched
5. **Check backend logs** → See user IDs and matching logic

## Still Not Working?

If users still don't match:

1. **Check backend logs** - Look for matching messages
2. **Verify queue length** - Should show 1, then 2, then matched
3. **Check timing** - Users should join sequentially (not simultaneously)
4. **Try manual API test** - Use curl/PowerShell with different guestIds
5. **Check browser console** - Look for errors or warnings

---

**Most Common Issue:** Both users have the same guestId because they're in the same browser. Solution: Use different browsers/devices or clear storage!



