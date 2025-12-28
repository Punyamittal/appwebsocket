/**
 * Skip On REST API Service
 * 
 * Handles matchmaking via REST API (server-authoritative)
 * Chat is handled via Firebase Realtime Database (see skipOnFirebaseService.ts)
 * 
 * Endpoints:
 * - POST /api/skip/match - Join queue or get matched
 * - POST /api/skip/leave - Leave queue/room
 * - GET /api/skip/status - Check current status
 */

import api from './api';
import { useAuthStore } from '../store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MatchResult {
  status: 'matched' | 'searching';
  roomId?: string;
  partnerId?: string;
  partnerName?: string;
  isPartnerGuest?: boolean;
}

export interface MatchStatus {
  status: 'idle' | 'searching' | 'matched';
  roomId?: string;
  partnerId?: string;
}

class SkipOnRESTService {
  private guestIdKey = 'skip_on_guest_id';

  /**
   * Get or create guest ID
   * On web, uses sessionStorage (unique per tab) to ensure each tab gets a different ID
   * On native, uses AsyncStorage (persists across app restarts)
   */
  async getGuestId(): Promise<string> {
    try {
      // On web, use sessionStorage (unique per tab/window)
      // On native, use AsyncStorage (persists across restarts)
      if (typeof window !== 'undefined' && window.sessionStorage) {
        // Web: use sessionStorage for unique ID per tab
        let guestId = sessionStorage.getItem(this.guestIdKey);
        if (!guestId) {
          // Generate new guest ID
          guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          sessionStorage.setItem(this.guestIdKey, guestId);
          console.log('✅ SkipOnREST: Generated new guest ID (web/sessionStorage):', guestId);
        } else {
          console.log('✅ SkipOnREST: Using existing guest ID (web/sessionStorage):', guestId);
        }
        return guestId;
      } else {
        // Native: use AsyncStorage
        let guestId = await AsyncStorage.getItem(this.guestIdKey);
        if (!guestId) {
          // Generate new guest ID
          guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await AsyncStorage.setItem(this.guestIdKey, guestId);
          console.log('✅ SkipOnREST: Generated new guest ID (native/AsyncStorage):', guestId);
        } else {
          console.log('✅ SkipOnREST: Using existing guest ID (native/AsyncStorage):', guestId);
        }
        return guestId;
      }
    } catch (error) {
      console.error('❌ SkipOnREST: Error getting guest ID:', error);
      // Fallback: generate temporary ID
      const fallbackId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('✅ SkipOnREST: Using fallback guest ID:', fallbackId);
      return fallbackId;
    }
  }

  /**
   * Get current user ID (authenticated or guest)
   */
  async getUserId(): Promise<{ userId: string; isGuest: boolean; token?: string }> {
    const { user, token } = useAuthStore.getState();
    
    if (user && !user.is_guest && token) {
      // Authenticated user
      return { userId: user.id, isGuest: false, token };
    } else {
      // Guest user
      const guestId = await this.getGuestId();
      return { userId: guestId, isGuest: true };
    }
  }

  /**
   * Join matchmaking queue or get matched
   */
  async match(): Promise<MatchResult> {
    console.log('[SkipOnREST] 🚀 match() called');
    
    try {
      const { userId, isGuest, token } = await this.getUserId();
      console.log('[SkipOnREST] User ID:', userId, 'isGuest:', isGuest, 'hasToken:', !!token);

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('[SkipOnREST] Added Authorization header');
      }

      const body: any = {};
      if (isGuest) {
        body.guestId = userId;
        console.log('[SkipOnREST] Added guestId to body:', userId);
      }

      console.log('[SkipOnREST] Making POST request to /skip/match');
      console.log('[SkipOnREST] Request body:', JSON.stringify(body));
      console.log('[SkipOnREST] Request headers:', headers);
      
      const startTime = Date.now();
      const response = await api.post('/skip/match', body, { headers });
      const duration = Date.now() - startTime;
      
      console.log(`✅ SkipOnREST: Match response received (${duration}ms):`, response.data);
      console.log('[SkipOnREST] Response status:', response.status);
      console.log('[SkipOnREST] Full response:', response);
      
      // Validate response
      if (!response.data) {
        console.error('[SkipOnREST] ❌ Null response from backend - server may not be running');
        throw new Error('Backend server is not available. Please ensure the FastAPI server is running on port 3001.');
      }
      
      if (response.data.status !== 'matched' && response.data.status !== 'searching') {
        console.error('[SkipOnREST] ❌ Invalid response structure:', response.data);
        throw new Error(`Invalid response from backend: ${JSON.stringify(response.data)}`);
      }
      
      console.log('[SkipOnREST] ✅ Returning match result:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ SkipOnREST: Match error:', error);
      console.error('[SkipOnREST] Error type:', error.constructor.name);
      console.error('[SkipOnREST] Error message:', error.message);
      console.error('[SkipOnREST] Error stack:', error.stack);
      if (error.response) {
        console.error('[SkipOnREST] Error response status:', error.response.status);
        console.error('[SkipOnREST] Error response data:', error.response.data);
      }
      if (error.request) {
        console.error('[SkipOnREST] Error request:', error.request);
      }
      throw new Error(error.response?.data?.detail || error.message || 'Failed to join matchmaking');
    }
  }

  /**
   * Leave matchmaking queue or current room
   */
  async leave(): Promise<void> {
    const { userId, isGuest, token } = await this.getUserId();

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const body: any = {};
      if (isGuest) {
        body.guestId = userId;
      }

      await api.post('/skip/leave', body, { headers });
      console.log('✅ SkipOnREST: Left matchmaking/room');
    } catch (error: any) {
      // Don't log as error - leaving is best-effort, especially during cleanup
      // Only log if it's not a network/server error (which is expected if server is down)
      const isServerError = error.code === 'ERR_NETWORK' || 
                           error.response?.status === 404 || 
                           error.response?.status === 503 ||
                           error.message?.includes('Backend server is not available');
      
      if (!isServerError) {
        console.warn('⚠️ SkipOnREST: Leave request failed (non-critical):', error.message || 'Unknown error');
      } else {
        console.log('ℹ️ SkipOnREST: Leave request skipped (server unavailable - expected during cleanup)');
      }
      // Don't throw - leaving is best-effort
    }
  }

  /**
   * Get current matchmaking status
   */
  async getStatus(): Promise<MatchStatus> {
    const { userId, isGuest, token } = await this.getUserId();

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await api.get('/skip/status', { 
        headers,
        params: isGuest ? { guestId: userId } : undefined
      });
      
      return response.data;
    } catch (error: any) {
      console.error('❌ SkipOnREST: Status error:', error);
      return { status: 'idle' };
    }
  }
}

export default new SkipOnRESTService();

