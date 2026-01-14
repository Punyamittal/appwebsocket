# Fixed SkipOn Matching Issue

## Problem
Both users were getting different room IDs because authenticated users were getting temporary guest IDs instead of using their real user ID from the JWT token.

## Root Cause
When MongoDB is disabled, the backend code (lines 808-819) had the user lookup commented out, so authenticated users didn't get their user ID extracted from the JWT token. Instead, the code fell through to creating a `temp_guest_...` ID.

This meant:
- User 1 (authenticated): Got `temp_guest_xxx` ID → Matched with this temp ID
- User 2 (guest): Got their real guest ID → Matched separately
- Result: Both users in different rooms

## Solution
Updated `server.py` to extract the user ID from the JWT token using `verify_token` even when MongoDB is disabled. The `verify_token` function decodes the JWT and extracts the user ID from the `sub` field, which doesn't require MongoDB.

**Change made:**
- Extract user ID from JWT token payload (`sub` field)
- Use this as the userId for authenticated users
- Only create temp_guest IDs for users without valid tokens

## How It Works Now

1. **User 1 (Authenticated)** calls `/api/skip/match`:
   - Backend extracts user ID from JWT token: `TtssM29bwoda1LhzPMTGBot98k73`
   - Added to queue with this ID
   - Returns `{"status": "searching"}`

2. **User 2 (Guest)** calls `/api/skip/match`:
   - Backend uses guest ID: `0gspqoAGBahnbzQoxQmTCv68WvG2`
   - Finds User 1 in queue
   - Creates ONE room with both users
   - Both get `{"status": "matched", "roomId": "skip_...", ...}` with the SAME roomId

3. **Result:** Both users in the SAME room! ✅

## Testing

After the fix:

1. **Restart the backend server:**
   ```powershell
   cd app\backend
   python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
   ```

2. **Test matching:**
   - User 1 (authenticated): Click "Start Chat"
   - User 2 (guest): Click "Start Chat"
   - Both should get the SAME roomId

3. **Check backend logs:**
   ```
   🔍 Skip On: Authenticated user ID from token: TtssM29bwoda1LhzPMTGBot98k73
   🔍 Skip On: Matching 0gspqoAGBahnbzQoxQmTCv68WvG2 with TtssM29bwoda1LhzPMTGBot98k73
   ✅ Skip On match: Room skip_... - TtssM29bwoda1LhzPMTGBot98k73 + 0gspqoAGBahnbzQoxQmTCv68WvG2
   ```

## What Changed

**Before (broken):**
```python
# Real authenticated user - MongoDB disabled, treat as guest
logger.info("🔍 Skip On: Authenticated token detected but MongoDB disabled - treating as guest")
# Skip database lookup - MongoDB is disabled
# (code commented out)
# Continue to guestId check → Creates temp_guest ID
```

**After (fixed):**
```python
# Real authenticated user - Extract user ID from JWT token (works without MongoDB)
payload = verify_token(token)
if payload:
    token_user_id = payload.get("sub")
    if token_user_id:
        userId = token_user_id
        isGuest = False
        logger.info(f"🔍 Skip On: Authenticated user ID from token: {userId}")
```

## Notes

- `verify_token` function doesn't require MongoDB - it just decodes the JWT
- User ID is stored in JWT payload's `sub` field
- This fix works even when MongoDB is disabled
- Authenticated users now use their real user ID, not temp_guest IDs

---

**The fix is now in place! Restart the backend server to apply the changes.** 🎉



