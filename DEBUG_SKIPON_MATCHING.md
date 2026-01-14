# Debug SkipOn Matching Issue

## Problem
Both users are getting DIFFERENT room IDs:
- User 1: `skip_6dcfae66-3fbb-4c72-aae6-69c0b591f832`
- User 2: `skip_dabe77e1-e9af-482a-ad4a-6957544c6e3d`

Both rooms show `status: waiting, userCount: 1`, meaning they're NOT matched together.

## Root Cause
The backend should create ONE room when two users match, but instead:
- Both users are getting "matched" status
- But with DIFFERENT room IDs
- This means they're being matched separately (or backend queue is broken)

## How to Debug

### Step 1: Check Backend Logs

When both users click "Start Chat", look at the backend terminal. You should see logs like:

**Expected (working):**
```
🔍 Skip On: /skip/match endpoint called
🔍 Skip On: User ID: guest_abc123
🔍 Skip On: Queue length before check: 0
🔍 Skip On: User guest_abc123 added to queue (queue length: 1)
🔍 Skip On: Returning searching response

🔍 Skip On: /skip/match endpoint called  
🔍 Skip On: User ID: guest_xyz789
🔍 Skip On: Queue length before check: 1
🔍 Skip On: Queue contents: ['guest_abc123']
🔍 Skip On: Matching guest_xyz789 with guest_abc123
✅ Skip On match: Room skip_... - guest_abc123 + guest_xyz789
```

**If broken (what you're seeing):**
```
🔍 Skip On: User guest_abc123 added to queue (queue length: 1)
... (User 2 calls)
🔍 Skip On: Queue length before check: 0  ← PROBLEM! Queue is empty!
```

### Step 2: Test with API Calls

**Terminal 1: User 1**
```powershell
$body1 = @{ guestId = 'user1_test' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body1
```

**Expected:** `{"status": "searching"}`

**Terminal 2: User 2 (wait 1 second)**
```powershell
Start-Sleep -Seconds 1
$body2 = @{ guestId = 'user2_test' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body2
```

**Expected:** `{"status": "matched", "roomId": "skip_...", "partnerId": "user1_test"}`

**Both should get the SAME roomId!**

### Step 3: Check if Queue is Persistent

The queue is in-memory, so:
- If backend restarts → queue is lost
- If multiple backend instances → each has its own queue
- Queue should persist during the same backend session

### Step 4: Common Issues

**Issue 1: Multiple Backend Instances**
- Each instance has its own queue
- User 1 connects to Instance 1 → added to Instance 1's queue
- User 2 connects to Instance 2 → Instance 2's queue is empty
- Result: Both users get "searching"

**Fix:** Only ONE backend server should run on port 3001

**Issue 2: Queue Being Cleared**
- Something is clearing the queue between requests
- Check backend logs for queue manipulation

**Issue 3: Race Condition**
- Both users call match() at exactly the same time
- Both check queue → both see empty → both added to queue
- But one might not see the other in queue

**Fix:** Sequential matching (wait between requests)

### Step 5: Verify Backend is Working

**Test the matchmaking manually:**
```powershell
# Clear any existing state (restart backend)
# Then test:

# User 1
$body1 = @{ guestId = 'test_user_1' } | ConvertTo-Json
$response1 = Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body1
$response1.Content  # Should be: {"status":"searching"}

# User 2 (wait 1 second)
Start-Sleep -Seconds 1
$body2 = @{ guestId = 'test_user_2' } | ConvertTo-Json
$response2 = Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body2
$response2.Content  # Should be: {"status":"matched","roomId":"skip_...","partnerId":"test_user_1"}

# Extract roomIds
$roomId1 = ($response1.Content | ConvertFrom-Json).roomId
$roomId2 = ($response2.Content | ConvertFrom-Json).roomId
Write-Host "Room 1: $roomId1"
Write-Host "Room 2: $roomId2"

# They should be the SAME!
if ($roomId1 -and $roomId2 -and $roomId1 -eq $roomId2) {
    Write-Host "✅ MATCHING WORKS! Same room ID: $roomId1" -ForegroundColor Green
} else {
    Write-Host "❌ MATCHING BROKEN! Different room IDs!" -ForegroundColor Red
}
```

## Expected Behavior

**When working correctly:**

1. **User 1 clicks "Start Chat"**
   - Backend: Added to queue → Returns `{"status": "searching"}`
   - Frontend: Starts polling (doesn't create room yet)

2. **User 2 clicks "Start Chat"**
   - Backend: Finds User 1 in queue → Creates room `skip_abc123` → Returns `{"status": "matched", "roomId": "skip_abc123", "partnerId": "user1"}`
   - Frontend: Creates Firebase room `skip_abc123`

3. **User 1's next poll**
   - Backend: User 1 already in room `skip_abc123` → Returns `{"status": "matched", "roomId": "skip_abc123", "partnerId": "user2"}`
   - Frontend: Creates Firebase room `skip_abc123` (same as User 2!)

**Result: Both users in the SAME room!** ✅

## What to Check

1. ✅ Only ONE backend server running (check `netstat -ano | findstr ":3001"`)
2. ✅ Backend logs show queue contents correctly
3. ✅ Manual API test shows matching works
4. ✅ Users are not being matched to separate partners
5. ✅ Queue persists between requests (not cleared)

## Still Not Working?

If the manual API test works but browser doesn't:
- Check browser console (F12) → Network tab
- Check request/response bodies
- Verify both users are using the same backend URL
- Check for CORS or network errors

If the manual API test also fails:
- Backend queue logic is broken
- Check backend logs for queue state
- Restart backend server (clears queue/rooms)
- Try again with manual test



