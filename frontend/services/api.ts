import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENABLE_DEMO_MODE } from '../config/demo';
import { Platform } from 'react-native';
import httpClient from './httpClient';

// Get backend URL from environment
let API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
if (!API_URL) {
  API_URL = 'http://localhost:3001';
  console.warn('⚠️ No backend URL configured, using default:', API_URL);
} else {
  console.log('✅ Backend URL configured:', API_URL);
}

// Create API instance using platform-appropriate HTTP client
const api = httpClient.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
// For web, auth is handled in the fetch wrapper
// For native, use interceptors if available
if (Platform.OS !== 'web' && api.interceptors) {
  api.interceptors.request.use(async (config: any) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

  // Intercept responses to handle demo mode or backend unavailability
  api.interceptors.response.use(
    (response: any) => response,
    async (error: any) => {
      // If demo mode is enabled, suppress network errors for showcase
      if (ENABLE_DEMO_MODE && (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK')) {
        console.log('Demo mode: Backend not available, using mock data');
        // Return a mock response structure to prevent crashes
        return Promise.resolve({
          data: null,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: error.config,
        });
      }
      return Promise.reject(error);
    }
  );
}

export default api;
