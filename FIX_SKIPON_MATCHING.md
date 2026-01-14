# Fix SkipOn Matching Issue

## Problem
Two users are getting different room IDs and not being matched - they end up in separate rooms.

## Root Cause
The matchmaking logic creates waiting rooms for users, but when the second user joins, they might be creating a new room instead of joining the first user's waiting room.

## Solution

The issue is in the matchmaking flow. When both users call `/api/skip/match`:

1. **User 1 calls match()**:
   - No one in queue
   - Creates a waiting room with only user1Id
   - Returns "searching"

2. **User 2 calls match()**:
   - Should find User 1's waiting room (lines 884-910)
   - OR should match from queue if User 1 is in queue
   - But both users might end up with separate rooms

## How to Debug

1. **Check backend logs** when both users click "Start Chat":
   ```powershell
   # Look at the backend terminal
   # You should see logs like:
   # "🔍 Skip On: Queue length before check: X"
   # "🔍 Skip On: Queue contents: [...]"
   # "🔍 Skip On: Matching X with Y"
   ```

2. **Check if users are in the queue**:
   - Backend logs should show queue contents
   - Both users should be in the queue OR one should have a waiting room

3. **Test the matchmaking**:
   ```powershell
   # Terminal 1: User 1
   $body1 = @{ guestId = 'user1' } | ConvertTo-Json
   Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body1
   
   # Terminal 2: User 2 (wait 1 second)
   Start-Sleep -Seconds 1
   $body2 = @{ guestId = 'user2' } | ConvertTo-Json
   Invoke-WebRequest -Uri 'http://localhost:3001/api/skip/match' -Method POST -ContentType 'application/json' -Body $body2
   ```

## Expected Behavior

- **User 1**: Returns `{"status": "searching"}`
- **User 2**: Returns `{"status": "matched", "roomId": "...", "partnerId": "user1"}`

Both users should get the **same roomId**!

## If Users Are Still Not Matching

1. **Check backend logs** - look for:
   - "🔍 Skip On: Queue length before check: 1" (should be 1, not 0)
   - "🔍 Skip On: Matching user2 with user1" (should show matching)
   - "✅ Skip On match: Room ... - user1 + user2" (should create ONE room)

2. **Verify same backend instance**:
   - Only ONE backend server should be running on port 3001
   - Multiple servers = separate queues = no matching

3. **Check for timing issues**:
   - Both users calling match() at the exact same time
   - Race condition creating separate rooms

4. **Clear and retry**:
   - Both users should click "Skip" or "Leave"
   - Wait a moment
   - Then both click "Start Chat" again

## Quick Fix

1. **Make sure only ONE backend server is running**:
   ```powershell
   # Check processes on port 3001
   netstat -ano | findstr ":3001"
   # Should see only ONE Python process
   ```

2. **Restart backend server** (clears queue/rooms):
   ```powershell
   # Stop backend (Ctrl+C in backend terminal)
   # Then restart:
   cd app\backend
   python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
   ```

3. **Test with two browser tabs/windows**:
   - Tab 1: User 1 clicks "Start Chat"
   - Tab 2: User 2 clicks "Start Chat" (after Tab 1)
   - Both should get matched!

4. **Check browser console (F12)**:
   - Look for network requests to `/api/skip/match`
   - Check responses - both should get the same roomId when matched



