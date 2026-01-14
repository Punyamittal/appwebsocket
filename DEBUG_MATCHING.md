# Debug SkipOn Matching Issue

## Current Status
- ✅ Authentication is working
- ❌ Matching is NOT working (both users stuck in "searching" state)

## How Matching Should Work

1. **User 1** calls `/api/skip/match`:
   - Backend extracts user ID from JWT token (or uses guestId)
   - No one in queue → Added to queue
   - Returns: `{"status": "searching"}`

2. **User 2** calls `/api/skip/match`:
   - Backend extracts user ID
   - Finds User 1 in queue
   - Creates room with both users
   - Returns: `{"status": "matched", "roomId": "skip_...", "partnerId": "..."}`

3. **User 1** polls `/api/skip/match`:
   - Backend finds User 1 is already in a room
   - Returns: `{"status": "matched", "roomId": "skip_...", "partnerId": "..."}`

## Debugging Steps

### 1. Check Backend Logs

When both users click "Start Chat", check the backend terminal for:

```
🔍 Skip On: Processing match for userId: <USER_ID>
🔍 Skip On: Queue length before check: <NUMBER>
🔍 Skip On: Queue contents: [<USER_IDS>]
```

**What to look for:**
- When User 1 calls: Should see "User ... added to queue (queue length: 1)"
- When User 2 calls: Should see "Queue length before check: 1" and "Matching ... with ..."
- If you see "Queue length: 0" when User 2 calls, that's the problem!

### 2. Check User IDs

The issue might be that both users are getting the same user ID, or the user ID extraction isn't working.

**In browser console, check:**
```javascript
// For authenticated user
localStorage.getItem('authToken') // Should have a token
// Decode the token to see the user ID (or check network tab)

// For guest user
sessionStorage.getItem('skip_on_guest_id') // Should have a unique guest ID
```

### 3. Test Matching Manually

Open two browser tabs (or use incognito for one):

**Tab 1 (Authenticated User):**
1. Login first
2. Open browser console
3. Go to SkipOn chat
4. Click "Start Chat"
5. Check console for user ID and match response

**Tab 2 (Guest User):**
1. Don't login (stay as guest)
2. Open browser console  
3. Go to SkipOn chat
4. Click "Start Chat"
5. Check console for guest ID and match response

**Expected:**
- Tab 1: Gets `{"status": "searching"}` first
- Tab 2: Gets `{"status": "matched", "roomId": "...", "partnerId": "..."}`
- Tab 1: After polling, gets `{"status": "matched", "roomId": "...", "partnerId": "..."}`

### 4. Check Backend Code

The matching logic is in `app/backend/server.py` around line 950-1010.

**Key points:**
- Line 955: Checks for available partners in queue
- Line 957: If partner found, matches them
- Line 1010: If no partner, adds to queue

**Common issues:**
1. **User IDs are the same** → Both users get same ID, can't match
2. **Queue is being cleared** → Users added but queue empty when second user calls
3. **User ID extraction failing** → Both users get temp_guest IDs that are different

## Quick Fix Test

To test if matching works at all, try this in the backend terminal:

```python
# In Python shell (cd app/backend first)
from server import skip_matchmaking_queue, skip_active_rooms

# Simulate User 1
skip_matchmaking_queue.append({"userId": "test_user_1", "isGuest": False, "timestamp": "2024-01-01"})
print("Queue after User 1:", skip_matchmaking_queue)

# Simulate User 2 (should match)
# This would normally happen via the API endpoint
```

## What to Report

When reporting the issue, include:

1. **Backend logs** when both users click "Start Chat"
2. **Browser console logs** from both users
3. **Network tab** showing the `/api/skip/match` requests and responses
4. **User IDs** - Are they different? Are they correct?

---

**Next step:** Check the backend logs when both users try to match!



