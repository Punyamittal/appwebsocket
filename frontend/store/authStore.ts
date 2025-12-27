import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { User } from '../types';
import api from '../services/api';
import socketService from '../services/socket';
import { ENABLE_DEMO_MODE, MOCK_OTP, MOCK_TOKEN, generateMockUser } from '../config/demo';
import { getFirebaseAuth, isFirebaseEnabled, getGoogleProvider, getAppleProvider } from '../services/firebase';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

// Complete the OAuth flow in the browser
WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (email: string) => Promise<string>;
  verifyOTP: (email: string, otp: string) => Promise<void>;
  guestLogin: (guestUuid: string, name: string, city: string, gender: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
}

// Helper function to convert Firebase user to our User type
const firebaseUserToUser = (firebaseUser: FirebaseUser): User => {
  const displayName = firebaseUser.displayName || '';
  const email = firebaseUser.email || '';
  const name = displayName || email.split('@')[0] || 'User';
  
  return {
    id: firebaseUser.uid,
    email: email,
    name: name,
    city: '', // Will be set in profile setup
    gender: 'other' as any, // Will be set in profile setup
    status: 'active' as any,
    is_guest: false,
    created_at: firebaseUser.metadata.creationTime || new Date().toISOString(),
    online: false,
  };
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: async (user) => {
    // Persist user to AsyncStorage when setting
    if (user) {
      try {
        await AsyncStorage.setItem('auth_user', JSON.stringify(user));
      } catch (error) {
        console.error('Error persisting user:', error);
      }
    } else {
      try {
        await AsyncStorage.removeItem('auth_user');
      } catch (error) {
        console.error('Error removing user:', error);
      }
    }
    set({ user, isAuthenticated: !!user });
  },
  
  setIsLoading: (isLoading) => set({ isLoading }),
  
  setToken: async (token) => {
    if (token) {
      await AsyncStorage.setItem('auth_token', token);
      // Only connect socket if backend is available (not in demo mode or if backend is configured)
      if (!ENABLE_DEMO_MODE) {
        try {
          socketService.connect(token);
        } catch (error) {
          console.log('Socket connection skipped in demo mode');
        }
      }
    } else {
      await AsyncStorage.removeItem('auth_token');
      socketService.disconnect();
    }
    set({ token });
  },

  login: async (email: string) => {
    if (ENABLE_DEMO_MODE) {
      // Return mock OTP in demo mode
      console.log('Demo mode: Mock login for', email);
      return MOCK_OTP;
    }
    
    try {
      const response = await api.post('/auth/login', { email });
      return response.data.otp;
    } catch (error: any) {
      // Fallback to demo mode if backend is unavailable
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        console.log('Backend unavailable, using demo mode');
        return MOCK_OTP;
      }
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  },

  verifyOTP: async (email: string, otp: string) => {
    if (ENABLE_DEMO_MODE || otp === MOCK_OTP) {
      // Use mock authentication in demo mode
      console.log('Demo mode: Mock OTP verification');
      const mockUser = generateMockUser({
        email,
        name: email.split('@')[0], // Use email prefix as name
        city: 'Demo City',
        gender: 'other',
        isGuest: false,
      });
      const token = MOCK_TOKEN;
      
      // Store user data in AsyncStorage for demo mode persistence
      await AsyncStorage.setItem('demo_user', JSON.stringify(mockUser));
      await get().setToken(token);
      await get().setUser(mockUser);
      return;
    }
    
    try {
      const response = await api.post('/auth/verify-otp', { email, otp });
      const { access_token, user } = response.data;
      
      await get().setToken(access_token);
      await get().setUser(user);
    } catch (error: any) {
      // Fallback to demo mode if backend is unavailable
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        console.log('Backend unavailable, using demo mode');
        const mockUser = generateMockUser({
          email,
          name: email.split('@')[0],
          city: 'Demo City',
          gender: 'other',
          isGuest: false,
        });
        await AsyncStorage.setItem('demo_user', JSON.stringify(mockUser));
        await get().setToken(MOCK_TOKEN);
        await get().setUser(mockUser);
        return;
      }
      throw new Error(error.response?.data?.detail || 'OTP verification failed');
    }
  },

  guestLogin: async (guestUuid: string, name: string, city: string, gender: string) => {
    if (ENABLE_DEMO_MODE) {
      // Use mock authentication in demo mode
      console.log('Demo mode: Mock guest login');
      const mockUser = generateMockUser({
        name,
        city,
        gender,
        isGuest: true,
        guestUuid,
      });
      const token = `demo_guest_token_${Date.now()}`;
      
      // Store user data in AsyncStorage for demo mode persistence
      await AsyncStorage.setItem('demo_user', JSON.stringify(mockUser));
      await AsyncStorage.setItem('guest_uuid', guestUuid);
      await get().setToken(token);
      await get().setUser(mockUser);
      return;
    }
    
    try {
      const response = await api.post('/auth/guest-login', {
        guest_uuid: guestUuid,
        name,
        city,
        gender,
      });
      const { access_token, user } = response.data;
      
      await AsyncStorage.setItem('guest_uuid', guestUuid);
      await get().setToken(access_token);
      await get().setUser(user);
    } catch (error: any) {
      // Fallback to demo mode if backend is unavailable
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        console.log('Backend unavailable, using demo mode');
        const mockUser = generateMockUser({
          name,
          city,
          gender,
          isGuest: true,
          guestUuid,
        });
        await AsyncStorage.setItem('demo_user', JSON.stringify(mockUser));
        await AsyncStorage.setItem('guest_uuid', guestUuid);
        await get().setToken(`demo_guest_token_${Date.now()}`);
        await get().setUser(mockUser);
        return;
      }
      throw new Error(error.response?.data?.detail || 'Guest login failed');
    }
  },

  signInWithGoogle: async () => {
    if (!isFirebaseEnabled) {
      throw new Error('Firebase is not configured. Please set Firebase config in app.json');
    }

    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase auth not initialized');

      console.log('🔵 Starting Google OAuth with Firebase');

      if (Platform.OS === 'web') {
        // Web: Use signInWithPopup
        const provider = getGoogleProvider();
        const result = await signInWithPopup(auth, provider);
        const firebaseUser = result.user;
        const idToken = await firebaseUser.getIdToken();
        
        const user = firebaseUserToUser(firebaseUser);
        await get().setToken(idToken);
        set({ user, isAuthenticated: true });
      } else {
        // Native: Use Expo AuthSession
        // For native, we need to use a different approach
        // This is a simplified version - for production, use @react-native-google-signin/google-signin
        throw new Error('Native Google sign-in not yet implemented. Please use web for now.');
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      throw new Error(error.message || 'Google sign-in failed');
    }
  },

  signInWithApple: async () => {
    if (!isFirebaseEnabled) {
      throw new Error('Firebase is not configured. Please set Firebase config in app.json');
    }

    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase auth not initialized');

      console.log('🔵 Starting Apple OAuth with Firebase');

      if (Platform.OS === 'web') {
        // Web: Use signInWithPopup
        const provider = getAppleProvider();
        const result = await signInWithPopup(auth, provider);
        const firebaseUser = result.user;
        const idToken = await firebaseUser.getIdToken();
        
        const user = firebaseUserToUser(firebaseUser);
        await get().setToken(idToken);
        await get().setUser(user);
        console.log('✅ Apple sign-in successful');
      } else {
        // Native: Use Expo AuthSession or native Apple Sign In
        throw new Error('Native Apple sign-in not yet implemented. Please use web for now.');
      }
    } catch (error: any) {
      console.error('❌ Apple sign-in error:', error);
      
      // Provide helpful error messages
      if (error.code === 'auth/operation-not-allowed') {
        throw new Error('Apple sign-in is not enabled in Firebase. Go to Firebase Console → Authentication → Sign-in method → Apple → Enable → Save. Wait 2-3 minutes, then try again. See APPLE_SIGNIN_VERIFY.md for verification steps.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in cancelled');
      } else if (error.code === 'auth/invalid-client') {
        throw new Error('Apple sign-in configuration error. Please check Firebase Console settings.');
      } else {
        throw new Error(error.message || 'Apple sign-in failed');
      }
    }
  },

  logout: async () => {
    try {
      console.log('🔄 Logout: Starting logout process...');
      
      // Sign out from Firebase if configured and user is logged in
      if (isFirebaseEnabled) {
        try {
          const auth = getFirebaseAuth();
          if (auth && auth.currentUser) {
            console.log('🔥 Logout: Signing out from Firebase...');
            await firebaseSignOut(auth);
            console.log('✅ Logout: Firebase sign out successful');
          } else {
            console.log('ℹ️ Logout: No Firebase user to sign out');
          }
        } catch (error) {
          console.error('⚠️ Logout: Firebase sign out error:', error);
          // Continue with local logout even if Firebase sign out fails
        }
      }

      // Clear ALL local storage (comprehensive cleanup)
      console.log('🧹 Logout: Clearing local storage...');
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('auth_user'); // New: also remove persisted user
      await AsyncStorage.removeItem('demo_user');
      await AsyncStorage.removeItem('guest_uuid');
      console.log('✅ Logout: Local storage cleared');
      
      // Disconnect socket if connected
      try {
        socketService.disconnect();
        console.log('✅ Logout: Socket disconnected');
      } catch (error) {
        console.log('ℹ️ Logout: Socket disconnect error (can be ignored):', error);
      }
      
      // Reset auth state IMMEDIATELY
      console.log('🔄 Logout: Resetting auth state...');
      await get().setUser(null);
      await get().setToken(null);
      set({ isLoading: false });
      console.log('✅ Logout: Auth state reset - user is now logged out');
    } catch (error) {
      console.error('❌ Logout: Error during logout:', error);
      // Still reset state even if there's an error to ensure user is logged out
      await get().setUser(null);
      await get().setToken(null);
      set({ isLoading: false });
      throw error;
    }
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      // First, try to load from Firebase auth
      if (isFirebaseEnabled) {
        const auth = getFirebaseAuth();
        if (auth) {
          return new Promise<void>((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
              unsubscribe();
              
              if (firebaseUser) {
                const idToken = await firebaseUser.getIdToken();
                const user = firebaseUserToUser(firebaseUser);
                await get().setToken(idToken);
                await get().setUser(user);
                set({ isLoading: false });
                resolve();
                return;
              }
              
              // No Firebase user, try demo mode fallback
              if (ENABLE_DEMO_MODE) {
                const storedUser = await AsyncStorage.getItem('demo_user');
                if (storedUser) {
                  const user = JSON.parse(storedUser);
                  const token = await AsyncStorage.getItem('auth_token') || MOCK_TOKEN;
                  await get().setToken(token);
                  await get().setUser(user);
                  set({ isLoading: false });
                  resolve();
                  return;
                }
              }
              
              await get().setUser(null);
              await get().setToken(null);
              set({ isLoading: false });
              resolve();
            });
          });
        }
      }

      // Fallback to demo mode or existing token-based auth
      if (ENABLE_DEMO_MODE) {
        const storedUser = await AsyncStorage.getItem('demo_user');
        if (storedUser) {
          const user = JSON.parse(storedUser);
          const token = await AsyncStorage.getItem('auth_token') || MOCK_TOKEN;
          await get().setToken(token);
          await get().setUser(user);
          set({ isLoading: false });
          return;
        }
      } else {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) {
          // Try to fetch user from backend
          try {
            const response = await api.get('/auth/me');
            await get().setToken(token);
            await get().setUser(response.data);
            set({ isLoading: false });
            return;
          } catch (error) {
            // If backend is unavailable, clear token
            await AsyncStorage.removeItem('auth_token');
          }
        }
      }
      
      await get().setUser(null);
      await get().setToken(null);
      set({ isLoading: false });
    } catch (error) {
      console.error('Error loading user:', error);
      set({ isLoading: false });
    }
  },

  updateProfile: async (updates: Partial<User>) => {
    if (ENABLE_DEMO_MODE) {
      // In demo mode, just update local state and persist
      console.log('Demo mode: Mock profile update');
      const currentUser = get().user;
      if (currentUser) {
        const updatedUser = { ...currentUser, ...updates };
        await AsyncStorage.setItem('demo_user', JSON.stringify(updatedUser));
        set({ user: updatedUser });
      }
      return;
    }
    
    try {
      const response = await api.put('/profile', updates);
      set({ user: response.data });
    } catch (error: any) {
      // Fallback to local update if backend is unavailable
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        console.log('Backend unavailable, updating local state only');
        const currentUser = get().user;
        if (currentUser) {
          const updatedUser = { ...currentUser, ...updates };
          set({ user: updatedUser });
        }
        return;
      }
      throw new Error(error.response?.data?.detail || 'Profile update failed');
    }
  },
}));
