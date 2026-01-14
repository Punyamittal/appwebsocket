# Test SkipOn Matching - Step by Step

## Current Issue
Users are not staying in "searching" mode and not getting matched.

## What to Check

### 1. Browser Console Logs

When User 1 clicks "Start Chat", look for:

**Expected logs:**
```
[SkipOnREST] 🚀 match() called
[SkipOnREST] User ID: <USER_ID> isGuest: false hasToken: true
[SkipOnREST] Added gender to body: <GENDER>
[SkipOnREST] Making POST request to /skip/match
[SkipOnREST] Request body: {"gender":"..."}
✅ SkipOnREST: Match response received: {status: 'searching'}
[SkipOn] 🔍 In queue, waiting for match...
[SkipOn] isSearching is: true - will start polling
[SkipOn] ✅ Starting status polling...
[SkipOn] 🚀 startStatusPolling called
```

**If you DON'T see these:**
- `[SkipOnREST] Added gender to body` → Gender not being added
- `{status: 'searching'}` → Backend not returning searching
- `[SkipOn] ✅ Starting status polling` → Polling not starting

### 2. Backend Terminal Logs

When User 1 calls match(), look for:

**Expected logs:**
```
🔍 Skip On: /skip/match endpoint called
🔍 Skip On: Request body: SkipMatchRequest(gender='...', guestId=None)
🔍 Skip On: Gender from request: ...
🔍 Skip On: Authenticated user ID from token: <USER_ID>
🔍 Skip On: Processing match for userId: <USER_ID>, isGuest: False
🔍 Skip On: Queue length before check: 0
🔍 Skip On: Available compatible partners: 0 (user gender: ...)
🔍 Skip On: User <USER_ID> (gender: ...) added to queue (queue length: 1)
🔍 Skip On: Returning searching response
```

**If you see errors:**
- `No userId, no guestId, and no valid token` → Auth issue
- `No gender provided` → Gender not being sent
- `Generated temporary guest ID` → Should NOT see this!

### 3. Test Matching Flow

**Step 1: User 1 (Authenticated)**
1. Open browser console
2. Click "Start Chat"
3. Check console for:
   - Request body should have `{"gender": "..."}`
   - Response should be `{status: 'searching'}`
   - Should see "Starting status polling"

**Step 2: User 2 (Guest or Authenticated)**
1. Open different browser/incognito
2. Open browser console
3. Click "Start Chat"
4. Check console for:
   - Request body should have `{"gender": "...", "guestId": "..."}` (if guest)
   - Response should be `{status: 'matched', roomId: '...', partnerId: '...'}`

**Step 3: Check Backend Logs**
- Should see: `🔍 Skip On: Matching <USER2> with <USER1>`
- Should see: `✅ Skip On match: Room skip_... - <USER1> + <USER2>`

## Common Issues

### Issue 1: Request body is empty `{}`
**Fix:** Refresh browser to load updated frontend code

### Issue 2: Backend returns error instead of "searching"
**Check:** Backend terminal for error messages

### Issue 3: Polling not starting
**Check:** Browser console for `[SkipOn] ⚠️ Not starting polling because isSearching is false`

### Issue 4: Users not matching
**Check:** 
- Are genders compatible? (Male+Female or Other+Other)
- Are both users in queue? (Check backend logs)
- Are there temp_guest entries in queue? (Should be cleaned automatically)

## Quick Test

Open browser console and run:
```javascript
// Check if gender is being sent
localStorage.getItem('auth_token') // Should have token
// Check user object
// In React DevTools, check useAuthStore state
```

## What to Report

Please share:
1. **Browser console logs** when clicking "Start Chat"
2. **Backend terminal logs** when match() is called
3. **Network tab** showing the `/api/skip/match` request and response
4. **Any error messages** in console or terminal



