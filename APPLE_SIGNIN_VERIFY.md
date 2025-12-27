# Apple Sign-In Verification Checklist

## Quick Verification Steps

If you're getting `auth/operation-not-allowed` error, follow these steps to verify your setup:

### ✅ Step 1: Verify Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Make sure you're in the correct project: **gingr-13c0c**
3. Check the project ID in the URL: `https://console.firebase.google.com/project/gingr-13c0c`

### ✅ Step 2: Enable Apple Sign-In
1. In Firebase Console, click **Authentication** (left sidebar)
2. Click **Sign-in method** tab
3. Scroll down to find **Apple** provider
4. **CRITICAL:** Click on **Apple** (not just the toggle)
5. In the popup that opens:
   - Toggle **Enable** to ON (should be blue/green)
   - **IMPORTANT:** Scroll down and click **Save** button at the bottom
6. Wait 1-2 minutes for changes to propagate

### ✅ Step 3: Verify It's Enabled
1. After clicking Save, the Apple provider should show:
   - Status: **Enabled** (green checkmark or indicator)
   - The toggle should be ON
2. If you see "Disabled" or the toggle is OFF, repeat Step 2

### ✅ Step 4: Check Authorized Domains (For Web)
1. In Firebase Console, go to **Authentication** → **Settings** tab (NOT Sign-in method)
2. Scroll down to **Authorized domains** section
3. Make sure these domains are listed:
   - `localhost` (for local development - you need to add this)
   - `gingr-13c0c.firebaseapp.com` (usually added by default)
   - Your production domain (if applicable)
4. To add `localhost`:
   - Click **Add domain** button
   - Type: `localhost`
   - Click **Add**
5. No need to click Save - domains are saved automatically when added

### ✅ Step 5: Test in Your App
1. **Clear your browser cache** or do a hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
2. Restart your development server if running
3. Try Apple sign-in again
4. If still getting error, wait 2-3 more minutes and try again (Firebase changes can take time to propagate)

## Common Issues

### Issue: "I enabled it but still getting the error"
**Solutions:**
- Make sure you clicked **Save** after enabling (not just toggled)
- Wait 2-3 minutes for Firebase to propagate changes
- Clear browser cache and hard refresh
- Check you're in the correct Firebase project

### Issue: "I don't see the Save button"
- Make sure you clicked on **Apple** provider (not just the toggle)
- A popup/modal should open with full settings
- The Save button is at the bottom of that popup

### Issue: "The toggle keeps turning off"
- This might be a browser cache issue
- Try a different browser or incognito mode
- Make sure you have proper permissions in Firebase project

### Issue: "Works in one browser but not another"
- Clear cache in the browser that's not working
- Make sure OAuth redirect domains include `localhost`

## Still Not Working?

1. **Double-check the project:**
   - Your Firebase project ID should be: `gingr-13c0c`
   - Verify in Firebase Console → Project Settings → General

2. **Check Firebase config in your app:**
   - Open `frontend/services/firebase.ts`
   - Verify `projectId: 'gingr-13c0c'` matches your Firebase project

3. **Try in incognito/private mode:**
   - Sometimes browser extensions or cache can interfere

4. **Check browser console:**
   - Look for any other errors that might give more clues

## Quick Test Command

After enabling, you can test by:
1. Opening your app
2. Clicking the Apple sign-in button
3. You should see an Apple sign-in popup (not an error)

If you see the popup, the setup is correct! If you still see the error, go back to Step 2 and make sure you clicked Save.

---

**Last Updated:** After enabling Apple sign-in, changes can take 1-3 minutes to propagate globally.

