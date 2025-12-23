import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import api from '../services/api';
import socketService from '../services/socket';

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
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  
  setToken: async (token) => {
    if (token) {
      await AsyncStorage.setItem('auth_token', token);
      socketService.connect(token);
    } else {
      await AsyncStorage.removeItem('auth_token');
      socketService.disconnect();
    }
    set({ token });
  },

  login: async (email: string) => {
    try {
      const response = await api.post('/auth/login', { email });
      return response.data.otp; // For demo purposes
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  },

  verifyOTP: async (email: string, otp: string) => {
    try {
      const response = await api.post('/auth/verify-otp', { email, otp });
      const { access_token, user } = response.data;
      
      await get().setToken(access_token);
      set({ user, isAuthenticated: true });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'OTP verification failed');
    }
  },

  guestLogin: async (guestUuid: string, name: string, city: string, gender: string) => {
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
      set({ user, isAuthenticated: true });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Guest login failed');
    }
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['auth_token', 'guest_uuid']);
    socketService.disconnect();
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        const response = await api.get('/auth/me');
        set({ user: response.data, token, isAuthenticated: true });
        socketService.connect(token);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      await get().logout();
    } finally {
      set({ isLoading: false });
    }
  },

  updateProfile: async (updates: Partial<User>) => {
    try {
      const response = await api.put('/profile', updates);
      set({ user: response.data });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Profile update failed');
    }
  },
}));
