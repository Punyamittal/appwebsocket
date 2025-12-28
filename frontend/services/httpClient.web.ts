/**
 * HTTP Client for Web platform
 * Uses fetch API directly to avoid axios Node.js module issues
 */

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENABLE_DEMO_MODE } from '../config/demo';

// Get backend URL from environment
let API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
if (!API_URL) {
  API_URL = 'http://localhost:3001';
  console.warn('⚠️ No backend URL configured, using default:', API_URL);
} else {
  console.log('✅ Backend URL configured:', API_URL);
}

async function makeRequest(method: string, url: string, data: any, baseConfig: any, requestConfig: any) {
  const fullUrl = url.startsWith('http') ? url : `${baseConfig.baseURL || ''}${url}`;
  console.log(`[httpClient.web] ${method} ${fullUrl}`);
  console.log('[httpClient.web] baseConfig.baseURL:', baseConfig.baseURL);
  console.log('[httpClient.web] url:', url);
  console.log('[httpClient.web] fullUrl:', fullUrl);
  
  const token = await AsyncStorage.getItem('auth_token');
  console.log('[httpClient.web] token exists:', !!token);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...baseConfig.headers,
    ...requestConfig?.headers,
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  console.log('[httpClient.web] Request headers:', headers);
  console.log('[httpClient.web] Request body:', data);
  
  const fetchOptions: RequestInit = {
    method,
    headers,
    // Add timeout using AbortController
  };
  
  if (data) {
    fetchOptions.body = typeof data === 'string' ? data : JSON.stringify(data);
    console.log('[httpClient.web] Request body stringified:', fetchOptions.body);
  }
  
  // Create AbortController for timeout (10 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error('[httpClient.web] ❌ Request timeout after 10 seconds');
    controller.abort();
  }, 10000);
  
  fetchOptions.signal = controller.signal;
  
  try {
    console.log('[httpClient.web] 🚀 Starting fetch request...');
    const startTime = Date.now();
    const response = await fetch(fullUrl, fetchOptions);
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    console.log(`[httpClient.web] ✅ Fetch response received (${duration}ms)`, response.status, response.statusText);
    
    const responseData = await response.json().catch((err) => {
      console.error('[httpClient.web] ❌ Failed to parse JSON:', err);
      return {};
    });
    console.log('[httpClient.web] Response data:', responseData);
    
    if (!response.ok) {
      console.error('[httpClient.web] ❌ Response not OK:', response.status, responseData);
      throw {
        response: {
          data: responseData,
          status: response.status,
          statusText: response.statusText,
        },
        code: 'ERR_NETWORK',
        message: responseData.detail || 'Request failed',
      };
    }
    
    console.log('[httpClient.web] ✅ Request successful');
    return { data: responseData, status: response.status, statusText: response.statusText };
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('[httpClient.web] ❌ Fetch error:', error);
    console.error('[httpClient.web] Error type:', error.constructor?.name);
    console.error('[httpClient.web] Error name:', error.name);
    console.error('[httpClient.web] Error message:', error.message);
    if (error.name === 'AbortError') {
      console.error('[httpClient.web] ❌ Request was aborted (timeout or cancelled)');
    }
    // Handle demo mode for network errors
    const isNetworkError = error.code === 'ERR_NETWORK' || 
                          error.message?.includes('Failed to fetch') || 
                          error.message?.includes('CORS') ||
                          error.message?.includes('blocked by CORS');
    
    if (ENABLE_DEMO_MODE && isNetworkError) {
      console.log('Demo mode: Backend not available, using mock data');
      console.error(`⚠️ Backend connection failed. Make sure FastAPI server is running on ${API_URL}`);
      console.error(`   Start with: cd backend && python -m uvicorn server:socket_app --host 0.0.0.0 --port ${new URL(API_URL).port || 3001} --reload`);
      // Return a proper error response instead of null
      throw {
        response: {
          data: { detail: 'Backend server is not available. Please ensure the FastAPI server is running.' },
          status: 503,
          statusText: 'Service Unavailable',
        },
        code: 'ERR_NETWORK',
        message: 'Backend server is not available',
      };
    }
    throw error;
  }
}

const httpClient = {
  create: (config: any) => ({
    get: async (url: string, requestConfig?: any) => {
      // Handle query params from requestConfig.params
      let finalUrl = url;
      if (requestConfig?.params) {
        const params = new URLSearchParams(requestConfig.params);
        const queryString = params.toString();
        if (queryString) {
          finalUrl += (url.includes('?') ? '&' : '?') + queryString;
        }
      }
      return makeRequest('GET', finalUrl, undefined, config, requestConfig);
    },
    post: async (url: string, data?: any, requestConfig?: any) => makeRequest('POST', url, data, config, requestConfig),
    put: async (url: string, data?: any, requestConfig?: any) => makeRequest('PUT', url, data, config, requestConfig),
    delete: async (url: string, requestConfig?: any) => makeRequest('DELETE', url, undefined, config, requestConfig),
    patch: async (url: string, data?: any, requestConfig?: any) => makeRequest('PATCH', url, data, config, requestConfig),
    interceptors: {
      request: { use: () => {} },
      response: { use: () => {} },
    },
  }),
};

export default httpClient;

