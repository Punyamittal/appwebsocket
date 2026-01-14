# Gender-Based Matching Update

## Changes Made

### Backend (`app/backend/server.py`)

1. **Added gender to queue**: Queue now stores gender for each user
2. **Gender compatibility check**: Users are only matched if:
   - Opposite genders (MALE + FEMALE), OR
   - Both are OTHER
3. **Removed single-user rooms**: Users can no longer be alone in a room
   - Removed "waiting room" logic that created single-user rooms
   - Rooms are only created when both users are matched together
4. **Updated room data**: Rooms now store both users' genders

### Backend Models (`app/backend/models.py`)

1. **Updated SkipMatchRequest**: Added optional `gender` field

### Frontend (`app/frontend/services/skipOnRESTService.ts`)

1. **Added gender to match request**: Frontend now sends user's gender in the match request body
   - Gets gender from `useAuthStore.getState().user.gender`
   - Defaults to 'other' if gender not available

## Matching Rules

1. **Opposite genders**: MALE can match with FEMALE
2. **Both OTHER**: Two users with gender "other" can match
3. **No single-user rooms**: Users stay in "searching" state until matched
4. **Even number requirement**: Users are only matched in pairs (2 users per room)

## How It Works

1. **User 1** calls `/api/skip/match` with `{ gender: "male" }`:
   - Added to queue with gender
   - Returns: `{"status": "searching"}`

2. **User 2** calls `/api/skip/match` with `{ gender: "female" }`:
   - Backend checks queue for compatible gender (opposite or both OTHER)
   - Finds User 1 (MALE) - compatible!
   - Creates room with both users
   - Returns: `{"status": "matched", "roomId": "skip_...", "partnerId": "..."}`

3. **User 1** polls `/api/skip/match`:
   - Backend finds User 1 is already in a room
   - Returns: `{"status": "matched", "roomId": "skip_...", "partnerId": "..."}`

## Testing

1. **Test opposite genders**:
   - User 1: gender = "male"
   - User 2: gender = "female"
   - Should match ✅

2. **Test both OTHER**:
   - User 1: gender = "other"
   - User 2: gender = "other"
   - Should match ✅

3. **Test same gender (should NOT match)**:
   - User 1: gender = "male"
   - User 2: gender = "male"
   - Should NOT match ❌ (both stay in "searching")

4. **Test no single-user rooms**:
   - User 1: calls match() → gets "searching"
   - User 1: should NOT have a room created
   - User 1: stays in "searching" until User 2 matches

## Next Steps

1. **Restart backend** to apply changes
2. **Test matching** with different gender combinations
3. **Verify** that users stay in "searching" until matched (no single-user rooms)

---

**Note**: If a user doesn't have a gender set (e.g., guest users), the frontend defaults to "other" for backward compatibility.



