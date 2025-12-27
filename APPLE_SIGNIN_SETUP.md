# Apple Sign-In Setup Guide

## Issue
If you see the error: `Firebase: Error (auth/operation-not-allowed)`, it means Apple sign-in is not enabled in your Firebase project.

## Steps to Enable Apple Sign-In in Firebase

### 1. Enable Apple Sign-In in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **gingr-13c0c**
3. Click **Authentication** in the left sidebar
4. Click **Sign-in method** tab
5. Find **Apple** in the list of providers
6. Click on **Apple** to open settings
7. Click **Enable** toggle
8. Click **Save**

### 2. Configure Apple Sign-In (Required for Production Only)

**⚠️ Important:** Services ID and other Apple Developer credentials are **NOT required for development/testing**. You can test Apple sign-in with just enabling it (Step 1).

For **production apps**, you need to:

#### A. Register Your App with Apple

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Create an **App ID** (if not already created)
4. Enable **Sign in with Apple** capability
5. Create a **Service ID** for web authentication
6. Configure **Return URLs**:
   - Add: `https://gingr-13c0c.firebaseapp.com/__/auth/handler`
   - Add your production domain if applicable

#### B. Configure in Firebase

1. In Firebase Console → Authentication → Sign-in method → Apple
2. Enter your **Service ID** (from Apple Developer Portal)
3. Upload your **Private Key** (`.p8` file from Apple Developer Portal)
4. Enter your **Key ID** (from Apple Developer Portal)
5. Enter your **Team ID** (from Apple Developer Portal)
6. Click **Save**

**Note:** The "Services ID (not required for Apple)" field can be left empty for development. It's only needed when you want to use your own Apple Developer credentials for production.

### 3. For Development/Testing (Quick Setup)

For development, you can use a simplified setup:

1. In Firebase Console → Authentication → Sign-in method → Apple
2. Click **Enable** toggle
3. **Leave Services ID field empty** (it says "not required for Apple" - this is correct for development)
4. Click **Save** (important!)
5. **For OAuth redirect domains (Authorized domains):**
   - Go to **Authentication** → **Settings** tab (not Sign-in method)
   - Scroll to **Authorized domains** section
   - Click **Add domain**
   - Add: `localhost` (for local development)
   - Add: `gingr-13c0c.firebaseapp.com` (already added by default)
   - Add your production domain (when ready)
   - Click **Add** for each domain

**Note:** 
- Services ID is **NOT required** for development/testing
- For local development, you can use any Apple ID to test
- The Services ID field can remain empty until you're ready for production

### 4. Verify Setup

After enabling:

1. Try signing in with Apple in your app
2. Check Firebase Console → Authentication → Users
3. You should see the new user created

## Troubleshooting

### Error: "operation-not-allowed"
- **Fix:** Enable Apple sign-in in Firebase Console (Step 1 above)
- **Common Issue:** Forgot to click "Save" after enabling - make sure you click the Save button!
- **Common Issue:** Changes haven't propagated yet - wait 2-3 minutes after enabling
- **See:** `APPLE_SIGNIN_VERIFY.md` for detailed verification checklist

### Error: "invalid-client"
- **Fix:** Check that your Service ID, Key ID, and Team ID are correct in Firebase Console

### Error: "redirect-uri-mismatch"
- **Fix:** Make sure your return URLs are correctly configured in Apple Developer Portal

### Apple Sign-In Popup Doesn't Appear
- **Fix:** Check browser console for errors
- **Fix:** Ensure you're using HTTPS in production (Apple requires HTTPS)
- **Fix:** For local development, use `localhost` (not `127.0.0.1`)

## Code Status

✅ **Already Implemented:**
- Apple sign-in button in welcome screen
- Firebase authentication integration
- User state management after sign-in
- Error handling

⚠️ **Needs Configuration:**
- Enable Apple sign-in in Firebase Console (see Step 1)
- Configure Apple Developer credentials (for production)

## Testing

1. Enable Apple sign-in in Firebase Console
2. Refresh your app
3. Click "Apple" button on welcome screen
4. Complete Apple sign-in flow
5. Should redirect to profile setup

---

**Status:** Code is ready, just needs Firebase configuration! 🍎

