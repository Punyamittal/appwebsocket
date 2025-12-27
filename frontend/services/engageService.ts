/**
 * ENGAGE Feature - Socket.IO Client Service
 * 
 * Handles:
 * - Watch Along (YouTube sync)
 * - Play Along (Real-time Chess)
 * - Sing Along (Phase 1: same as Watch Along)
 * 
 * Architecture:
 * - Separate Socket.IO namespaces for each feature
 * - Auth required (token passed in handshake)
 * - Clean connection management
 */

import { io, Socket, Namespace } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';

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
  
  // For mobile devices, try to detect the correct IP
  // Default to localhost:3002 for Engage server
  if (Platform.OS === 'android') {
    // Android emulator uses 10.0.2.2 to access host machine
    return 'http://10.0.2.2:3002';
  } else if (Platform.OS === 'ios') {
    // iOS simulator can use localhost
    return 'http://localhost:3002';
  } else {
    // Web
    return 'http://localhost:3002';
  }
};

class EngageService {
  private watchAlongSocket: Namespace | null = null;
  private playAlongSocket: Namespace | null = null;
  private singAlongSocket: Namespace | null = null;
  private backendUrl: string;
  private userId: string | null = null;
  private token: string | null = null;

  constructor() {
    this.backendUrl = getBackendUrl();
    console.log(`[EngageService] Initialized with backend: ${this.backendUrl}`);
  }

  /**
   * Initialize connection to a namespace
   */
  private connectToNamespace(namespace: string, token: string, userId: string): Namespace {
    const url = `${this.backendUrl}${namespace}`;
    console.log(`[EngageService] Connecting to ${namespace} at ${url}...`);

    const socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
      connectTimeout: 20000,
      auth: {
        token,
        userId,
      },
      forceNew: false,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log(`[EngageService] ✅ Connected to ${namespace}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[EngageService] ❌ Disconnected from ${namespace}: ${reason}`);
    });

    socket.on('connect_error', (error) => {
      console.error(`[EngageService] ❌ Connection error to ${namespace}:`, error.message);
    });

    return socket;
  }

  /**
   * Initialize Watch Along connection
   */
  connectWatchAlong(token: string, userId: string): Namespace {
    if (this.watchAlongSocket?.connected) {
      return this.watchAlongSocket;
    }

    this.token = token;
    this.userId = userId;
    this.watchAlongSocket = this.connectToNamespace('/watch-along', token, userId);
    return this.watchAlongSocket;
  }

  /**
   * Initialize Play Along connection
   */
  connectPlayAlong(token: string, userId: string): Namespace {
    if (this.playAlongSocket?.connected) {
      return this.playAlongSocket;
    }

    this.token = token;
    this.userId = userId;
    this.playAlongSocket = this.connectToNamespace('/play-along', token, userId);
    return this.playAlongSocket;
  }

  /**
   * Initialize Sing Along connection
   */
  connectSingAlong(token: string, userId: string): Namespace {
    if (this.singAlongSocket?.connected) {
      return this.singAlongSocket;
    }

    this.token = token;
    this.userId = userId;
    this.singAlongSocket = this.connectToNamespace('/sing-along', token, userId);
    return this.singAlongSocket;
  }

  /**
   * Disconnect from Watch Along
   */
  disconnectWatchAlong(): void {
    if (this.watchAlongSocket) {
      this.watchAlongSocket.disconnect();
      this.watchAlongSocket = null;
      console.log('[EngageService] Disconnected from Watch Along');
    }
  }

  /**
   * Disconnect from Play Along
   */
  disconnectPlayAlong(): void {
    if (this.playAlongSocket) {
      this.playAlongSocket.disconnect();
      this.playAlongSocket = null;
      console.log('[EngageService] Disconnected from Play Along');
    }
  }

  /**
   * Disconnect from Sing Along
   */
  disconnectSingAlong(): void {
    if (this.singAlongSocket) {
      this.singAlongSocket.disconnect();
      this.singAlongSocket = null;
      console.log('[EngageService] Disconnected from Sing Along');
    }
  }

  /**
   * Disconnect all
   */
  disconnectAll(): void {
    this.disconnectWatchAlong();
    this.disconnectPlayAlong();
    this.disconnectSingAlong();
  }

  /**
   * Get Watch Along socket
   */
  getWatchAlongSocket(): Namespace | null {
    return this.watchAlongSocket;
  }

  /**
   * Get Play Along socket
   */
  getPlayAlongSocket(): Namespace | null {
    return this.playAlongSocket;
  }

  /**
   * Get Sing Along socket
   */
  getSingAlongSocket(): Namespace | null {
    return this.singAlongSocket;
  }
}

export default new EngageService();

