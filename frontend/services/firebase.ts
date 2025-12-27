import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import Constants from 'expo-constants';

// Get Firebase config from environment variables
// Try multiple sources: Constants.expoConfig, process.env, and direct Constants.manifest
const getConfigValue = (key: string): string => {
  // Try Constants.expoConfig.extra first (Expo SDK 49+)
  const expoExtraValue = Constants.expoConfig?.extra?.[key];
  if (expoExtraValue && typeof expoExtraValue === 'string' && expoExtraValue.trim() !== '') {
    return expoExtraValue;
  }
  // Try process.env
  const envValue = process.env[key];
  if (envValue && typeof envValue === 'string' && envValue.trim() !== '') {
    return envValue;
  }
  // Try Constants.manifest.extra (older Expo SDK)
  const manifestValue = (Constants.manifest as any)?.extra?.[key];
  if (manifestValue && typeof manifestValue === 'string' && manifestValue.trim() !== '') {
    return manifestValue;
  }
  return '';
};

// Temporary: Hardcode config to test Firebase (will read from app.json once Metro cache is cleared)
const firebaseConfig = {
  apiKey: getConfigValue('EXPO_PUBLIC_FIREBASE_API_KEY') || 'AIzaSyDBo7cnGRmuDa-zT2wV413pwSpY5HbZnVI',
  authDomain: getConfigValue('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') || 'gingr-13c0c.firebaseapp.com',
  projectId: getConfigValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID') || 'gingr-13c0c',
  storageBucket: getConfigValue('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') || 'gingr-13c0c.firebasestorage.app',
  messagingSenderId: getConfigValue('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') || '471244536424',
  appId: getConfigValue('EXPO_PUBLIC_FIREBASE_APP_ID') || '1:471244536424:web:028901627db4e7932b99dd',
  // Database URL for Realtime Database (required for Skip On chat)
  databaseURL: getConfigValue('EXPO_PUBLIC_FIREBASE_DATABASE_URL') || 'https://gingr-13c0c-default-rtdb.firebaseio.com/',
};

// Debug: Log what we're reading (only in development)
if (typeof window !== 'undefined') {
  console.log('🔍 Firebase Config Debug - Full Details:');
  console.log('- expoConfig exists:', !!Constants.expoConfig);
  console.log('- extra exists:', !!Constants.expoConfig?.extra);
  console.log('- All extra keys:', Constants.expoConfig?.extra ? Object.keys(Constants.expoConfig.extra) : 'NO EXTRA');
  console.log('- EXPO_PUBLIC_BACKEND_URL:', Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 'NOT FOUND');
  console.log('- EXPO_PUBLIC_FIREBASE_API_KEY:', Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_API_KEY ? 'FOUND (' + Constants.expoConfig.extra.EXPO_PUBLIC_FIREBASE_API_KEY.substring(0, 10) + '...)' : 'NOT FOUND');
  console.log('- firebaseConfig.apiKey:', firebaseConfig.apiKey || 'EMPTY');
  console.log('- firebaseConfig.authDomain:', firebaseConfig.authDomain || 'EMPTY');
  console.log('- firebaseConfig.projectId:', firebaseConfig.projectId || 'EMPTY');
}

// Check if Firebase is configured
const isFirebaseConfigured = firebaseConfig.apiKey && 
  firebaseConfig.authDomain && 
  firebaseConfig.projectId &&
  typeof firebaseConfig.apiKey === 'string' &&
  typeof firebaseConfig.authDomain === 'string' &&
  typeof firebaseConfig.projectId === 'string' &&
  firebaseConfig.apiKey.trim() !== '' && 
  firebaseConfig.authDomain.trim() !== '' &&
  firebaseConfig.projectId.trim() !== '';

if (!isFirebaseConfigured && typeof window !== 'undefined') {
  console.warn('⚠️ Firebase is not configured. Google/Apple OAuth will not work.');
  console.warn('   To enable OAuth, set Firebase config in app.json');
} else if (isFirebaseConfigured && typeof window !== 'undefined') {
  console.log('✅ Firebase config loaded:', {
    apiKey: firebaseConfig.apiKey.substring(0, 10) + '...',
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
  });
}

// Initialize Firebase (only once)
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

const initializeFirebase = () => {
  if (isFirebaseConfigured && !app) {
    try {
      // Check if already initialized
      const existingApps = getApps();
      if (existingApps.length > 0) {
        app = existingApps[0];
        auth = getAuth(app);
      } else {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
      }
      console.log('✅ Firebase initialized successfully');
    } catch (error) {
      console.error('❌ Firebase initialization error:', error);
    }
  } else if (!isFirebaseConfigured && typeof window !== 'undefined') {
    console.warn('⚠️ Firebase not configured - check your app.json config');
  }
  return { app, auth };
};

// Lazy initialization
export const getFirebaseAuth = (): Auth | null => {
  if (!auth) {
    const { auth: initializedAuth } = initializeFirebase();
    return initializedAuth;
  }
  return auth;
};

// Get providers (create them when needed, after auth is initialized)
export const getGoogleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  return provider;
};

export const getAppleProvider = () => {
  return new OAuthProvider('apple.com');
};

// Export config check
export const isFirebaseEnabled = isFirebaseConfigured;

// Export app instance (for other Firebase services if needed)
export const getFirebaseApp = (): FirebaseApp | null => {
  if (!app) {
    const { app: initializedApp } = initializeFirebase();
    return initializedApp;
  }
  return app;
};

export default { auth: getFirebaseAuth(), isEnabled: isFirebaseEnabled };
