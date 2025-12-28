/**
 * Chess REST API Service (Alternative to Socket.IO)
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

class ChessApiService {
  private backendUrl: string;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.backendUrl = getBackendUrl();
    console.log(`[ChessApiService] Initialized with backend: ${this.backendUrl}`);
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
   * Create a new chess room
   */
  async createRoom(userId: string): Promise<{
    success: boolean;
    roomId?: string;
    roomCode?: string;
    fen?: string;
    turn?: string;
    status?: string;
    error?: string;
  }> {
    try {
      console.log(`[ChessApiService] Creating chess room for user: ${userId}`);
      const response = await this.request<{
        success: boolean;
        roomId?: string;
        roomCode?: string;
        fen?: string;
        turn?: string;
        status?: string;
        error?: string;
      }>('/api/chess/create', {
        method: 'POST',
        body: JSON.stringify({ userId }),
        headers: {
          'X-User-Id': userId,
        },
      });

      if (response.success) {
        console.log(`[ChessApiService] ✅ Room created: ${response.roomId} (Code: ${response.roomCode})`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to create room');
      }
    } catch (error: any) {
      console.error('[ChessApiService] ❌ Error creating room:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to create room',
      };
    }
  }

  /**
   * Join an existing chess room by code
   */
  async joinRoom(userId: string, roomCode: string): Promise<{
    success: boolean;
    roomId?: string;
    roomCode?: string;
    fen?: string;
    turn?: string;
    status?: string;
    whitePlayer?: string;
    blackPlayer?: string;
    error?: string;
  }> {
    try {
      console.log(`[ChessApiService] Joining room with code: ${roomCode}`);
      const response = await this.request<{
        success: boolean;
        roomId?: string;
        roomCode?: string;
        fen?: string;
        turn?: string;
        status?: string;
        whitePlayer?: string;
        blackPlayer?: string;
        error?: string;
      }>('/api/chess/join', {
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
        console.log(`[ChessApiService] ✅ Joined room: ${response.roomId}`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to join room');
      }
    } catch (error: any) {
      console.error('[ChessApiService] ❌ Error joining room:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to join room',
      };
    }
  }

  /**
   * Get room status (for polling)
   */
  async getRoomStatus(roomId: string): Promise<{
    success: boolean;
    roomId?: string;
    roomCode?: string;
    fen?: string;
    turn?: string;
    status?: string;
    whitePlayer?: string;
    blackPlayer?: string;
    winner?: string;
    error?: string;
  }> {
    try {
      const response = await this.request<{
        success: boolean;
        roomId?: string;
        roomCode?: string;
        fen?: string;
        turn?: string;
        status?: string;
        whitePlayer?: string;
        blackPlayer?: string;
        winner?: string;
        error?: string;
      }>(`/api/chess/room/${roomId}`, {
        method: 'GET',
      });
      
      if (response.success) {
        return response;
      } else {
        throw new Error(response.error || 'Failed to get room status');
      }
    } catch (error: any) {
      console.error('[ChessApiService] ❌ Error getting room status:', error.message);
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
    console.log(`[ChessApiService] Starting polling for room: ${roomId}`);
    
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
      console.log('[ChessApiService] Stopped polling');
    }
  }

  /**
   * Make a chess move
   */
  async makeMove(
    roomId: string,
    userId: string,
    from: string,
    to: string,
    promotion?: string
  ): Promise<{
    success: boolean;
    fen?: string;
    turn?: string;
    status?: string;
    winner?: string;
    error?: string;
  }> {
    try {
      const response = await this.request<{
        success: boolean;
        fen?: string;
        turn?: string;
        status?: string;
        winner?: string;
        error?: string;
      }>('/api/chess/move', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          userId,
          from,
          to,
          promotion,
        }),
        headers: {
          'X-User-Id': userId,
        },
      });

      if (response.success) {
        console.log(`[ChessApiService] ✅ Move made: ${from}→${to}`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to make move');
      }
    } catch (error: any) {
      console.error('[ChessApiService] ❌ Error making move:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to make move',
      };
    }
  }
}

// Export singleton instance
const chessApiService = new ChessApiService();
export default chessApiService;

