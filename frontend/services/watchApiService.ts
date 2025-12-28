/**
 * Watch Along REST API Service
 * 
 * Uses HTTP REST API instead of Socket.IO for more reliable connections
 * Uses fetch API (works in browser/Expo web, no Node.js dependencies)
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get backend URL
const getBackendUrl = (): string => {
  const expoExtraValue = Constants.expoConfig?.extra?.['EXPO_PUBLIC_BACKEND_URL'];
  if (expoExtraValue && typeof expoExtraValue === 'string' && expoExtraValue.trim() !== '') {
    let url = expoExtraValue.trim();
    // Replace port if needed
    if (url.includes(':3001')) {
      url = url.replace(':3001', ':3002'); // Engage server on port 3002
    } else if (url.includes(':8001')) {
      url = url.replace(':8001', ':3002');
    }
    return url;
  }
  
  // Default to localhost:3002 for Engage server
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3002';
  } else if (Platform.OS === 'ios') {
    return 'http://localhost:3002';
  } else {
    // Web
    return 'http://localhost:3002';
  }
};

class WatchApiService {
  private backendUrl: string;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.backendUrl = getBackendUrl();
    console.log(`[WatchApiService] Initialized with backend: ${this.backendUrl}`);
  }

  /**
   * Make HTTP request using fetch (works in browser/Expo web)
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.backendUrl}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new Watch Along room
   */
  async createRoom(
    userId: string,
    videoId: string,
    videoUrl: string
  ): Promise<{
    success: boolean;
    roomId?: string;
    roomCode?: string;
    videoId?: string;
    videoUrl?: string;
    isPlaying?: boolean;
    currentTime?: number;
    hostId?: string;
    participants?: string[];
    error?: string;
  }> {
    try {
      console.log(`[WatchApiService] Creating Watch Along room for user: ${userId}`);
      const response = await this.request<{
        success: boolean;
        roomId?: string;
        roomCode?: string;
        videoId?: string;
        videoUrl?: string;
        isPlaying?: boolean;
        currentTime?: number;
        hostId?: string;
        participants?: string[];
        error?: string;
      }>('/api/watch/create', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          videoId,
          videoUrl,
        }),
        headers: {
          'X-User-Id': userId,
        },
      });

      if (response.success) {
        console.log(`[WatchApiService] ✅ Room created: ${response.roomId} (Code: ${response.roomCode})`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to create room');
      }
    } catch (error: any) {
      console.error('[WatchApiService] ❌ Error creating room:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to create room',
      };
    }
  }

  /**
   * Join an existing Watch Along room
   */
  async joinRoom(
    userId: string,
    roomCode: string
  ): Promise<{
    success: boolean;
    roomId?: string;
    roomCode?: string;
    videoId?: string;
    videoUrl?: string;
    isPlaying?: boolean;
    currentTime?: number;
    hostId?: string;
    isHost?: boolean;
    participants?: string[];
    error?: string;
  }> {
    try {
      console.log(`[WatchApiService] Joining Watch Along room with code: ${roomCode}`);
      const response = await this.request<{
        success: boolean;
        roomId?: string;
        roomCode?: string;
        videoId?: string;
        videoUrl?: string;
        isPlaying?: boolean;
        currentTime?: number;
        hostId?: string;
        isHost?: boolean;
        participants?: string[];
        error?: string;
      }>('/api/watch/join', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          roomCode: roomCode.trim(),
        }),
        headers: {
          'X-User-Id': userId,
        },
      });

      if (response.success) {
        console.log(`[WatchApiService] ✅ Joined room: ${response.roomId}`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to join room');
      }
    } catch (error: any) {
      console.error('[WatchApiService] ❌ Error joining room:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to join room',
      };
    }
  }

  /**
   * Get room status
   */
  async getRoomStatus(roomId: string): Promise<{
    success: boolean;
    roomId?: string;
    roomCode?: string;
    videoId?: string;
    videoUrl?: string;
    isPlaying?: boolean;
    currentTime?: number;
    hostId?: string;
    participants?: string[];
    error?: string;
  }> {
    try {
      const response = await this.request<{
        success: boolean;
        roomId?: string;
        roomCode?: string;
        videoId?: string;
        videoUrl?: string;
        isPlaying?: boolean;
        currentTime?: number;
        hostId?: string;
        participants?: string[];
        error?: string;
      }>(`/api/watch/room/${roomId}`, {
        method: 'GET',
      });
      
      if (response.success) {
        return response;
      } else {
        throw new Error(response.error || 'Failed to get room status');
      }
    } catch (error: any) {
      console.error('[WatchApiService] ❌ Error getting room status:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to get room status',
      };
    }
  }

  /**
   * Start polling room status
   */
  startPolling(
    roomId: string,
    onUpdate: (data: any) => void,
    interval: number = 2000
  ): void {
    this.stopPolling();
    console.log(`[WatchApiService] Starting polling for room: ${roomId}`);
    
    this.pollingInterval = setInterval(async () => {
      const status = await this.getRoomStatus(roomId);
      if (status.success) {
        onUpdate(status);
      }
    }, interval);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[WatchApiService] Stopped polling');
    }
  }

  /**
   * Play video (host only)
   */
  async play(
    roomId: string,
    userId: string,
    currentTime?: number
  ): Promise<{
    success: boolean;
    isPlaying?: boolean;
    currentTime?: number;
    error?: string;
  }> {
    try {
      const response = await this.request<{
        success: boolean;
        isPlaying?: boolean;
        currentTime?: number;
        error?: string;
      }>('/api/watch/play', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          userId,
          currentTime,
        }),
        headers: {
          'X-User-Id': userId,
        },
      });

      if (response.success) {
        console.log(`[WatchApiService] ✅ Play command sent`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to play');
      }
    } catch (error: any) {
      console.error('[WatchApiService] ❌ Error playing:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to play',
      };
    }
  }

  /**
   * Pause video (host only)
   */
  async pause(
    roomId: string,
    userId: string,
    currentTime?: number
  ): Promise<{
    success: boolean;
    isPlaying?: boolean;
    currentTime?: number;
    error?: string;
  }> {
    try {
      const response = await this.request<{
        success: boolean;
        isPlaying?: boolean;
        currentTime?: number;
        error?: string;
      }>('/api/watch/pause', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          userId,
          currentTime,
        }),
        headers: {
          'X-User-Id': userId,
        },
      });

      if (response.success) {
        console.log(`[WatchApiService] ✅ Pause command sent`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to pause');
      }
    } catch (error: any) {
      console.error('[WatchApiService] ❌ Error pausing:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to pause',
      };
    }
  }

  /**
   * Seek video (host only)
   */
  async seek(
    roomId: string,
    userId: string,
    currentTime: number
  ): Promise<{
    success: boolean;
    currentTime?: number;
    error?: string;
  }> {
    try {
      const response = await this.request<{
        success: boolean;
        currentTime?: number;
        error?: string;
      }>('/api/watch/seek', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          userId,
          currentTime,
        }),
        headers: {
          'X-User-Id': userId,
        },
      });

      if (response.success) {
        console.log(`[WatchApiService] ✅ Seek command sent to ${currentTime}s`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to seek');
      }
    } catch (error: any) {
      console.error('[WatchApiService] ❌ Error seeking:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to seek',
      };
    }
  }

  /**
   * Change video (host only)
   */
  async changeVideo(
    roomId: string,
    userId: string,
    videoId: string,
    videoUrl: string
  ): Promise<{
    success: boolean;
    videoId?: string;
    videoUrl?: string;
    error?: string;
  }> {
    try {
      const response = await this.request<{
        success: boolean;
        videoId?: string;
        videoUrl?: string;
        error?: string;
      }>('/api/watch/change-video', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          userId,
          videoId,
          videoUrl,
        }),
        headers: {
          'X-User-Id': userId,
        },
      });

      if (response.success) {
        console.log(`[WatchApiService] ✅ Video changed to ${videoId}`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to change video');
      }
    } catch (error: any) {
      console.error('[WatchApiService] ❌ Error changing video:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to change video',
      };
    }
  }
}

// Export singleton instance
const watchApiService = new WatchApiService();
export default watchApiService;

