/**
 * Skip On Service (REST + Socket.IO)
 * 
 * Architecture:
 * - Matchmaking: REST API (server-authoritative)
 * - Chat: Socket.IO (real-time messaging)
 * - NO Firebase Realtime Database
 * 
 * Works for both authenticated and guest users
 */

import skipOnRESTService, { MatchResult } from './skipOnRESTService';
import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';

export interface ChatMessageData {
  id: string;
  sender_id: string;
  message: string;
  timestamp: string;
  created_at: string;
}

// Get backend URL for Socket.IO (separate from REST API)
const getSocketIoUrl = (): string => {
  const expoExtraValue = Constants.expoConfig?.extra?.['EXPO_PUBLIC_SOCKETIO_URL'];
  if (expoExtraValue && typeof expoExtraValue === 'string' && expoExtraValue.trim() !== '') {
    return expoExtraValue.trim();
  }
  const envValue = process.env.EXPO_PUBLIC_SOCKETIO_URL;
  if (envValue && typeof envValue === 'string' && envValue.trim() !== '') {
    return envValue.trim();
  }
  // Default to port 3003 where Socket.IO is actually running
  return 'http://localhost:3003';
};

class SkipOnService {
  private currentRoomId: string | null = null;
  private currentUserId: string | null = null;
  private onMatchFoundCallback: ((roomId: string, partnerId?: string, partnerName?: string) => void) | null = null;
  private onMessageCallback: ((message: ChatMessageData) => void) | null = null;
  private onRoomEndedCallback: (() => void) | null = null;
  private onRoomReadyCallback: (() => void) | null = null;
  private socket: Socket | null = null;
  private isSearching: boolean = false;
  private matchPollingInterval: ReturnType<typeof setInterval> | null = null;
  private backendUrl: string;

  constructor() {
    this.backendUrl = getSocketIoUrl();
    console.log('[SkipOn] Service initialized with Socket.IO messaging');
    console.log('[SkipOn] Socket.IO URL:', this.backendUrl);
  }

  /**
   * Initialize Socket.IO connection
   */
  private initializeSocket(): void {
    if (this.socket?.connected) {
      console.log('[SkipOn] Socket already connected');
      return;
    }

    // Close existing socket if any
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    console.log(`[SkipOn] 🔌 Connecting to Socket.IO: ${this.backendUrl}`);
    this.socket = io(this.backendUrl, {
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      timeout: 30000,
      forceNew: true,
      upgrade: true, // Allow upgrade from polling to websocket
    });

    this.setupSocketHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[SkipOn] ✅ Socket.IO connected');
      console.log('[SkipOn] Socket ID:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      console.log('[SkipOn] Socket.IO disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SkipOn] ❌ Socket.IO connection error:', error);
      console.error('[SkipOn] Error type:', error.constructor.name);
      console.error('[SkipOn] Error message:', error.message);
      console.error('[SkipOn] Error details:', error);
    });

    // Message received from partner
    this.socket.on('skipon_message_received', (data: {
      roomId: string;
      senderId: string;
      message: string;
      timestamp: string;
    }) => {
      // Only process messages for current room
      if (data.roomId !== this.currentRoomId) {
        console.log('[SkipOn] ⚠️ Ignoring message for different room:', data.roomId);
        return;
      }

      // Don't process own messages
      if (data.senderId === this.currentUserId) {
        console.log('[SkipOn] ⚠️ Ignoring own message');
        return;
      }

      console.log('[SkipOn] 📨 Message received from partner:', data.message.substring(0, 50));

      if (this.onMessageCallback) {
        const messageData: ChatMessageData = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          sender_id: data.senderId,
          message: data.message,
          timestamp: data.timestamp,
          created_at: data.timestamp,
        };
        this.onMessageCallback(messageData);
      }
    });

    // Message sent confirmation
    this.socket.on('skipon_message_sent', (data: { roomId: string; timestamp: string }) => {
      console.log('[SkipOn] ✅ Message sent confirmation for room:', data.roomId);
    });

    // Room joined confirmation
    this.socket.on('skipon_room_joined', (data: { roomId: string; partnerId: string }) => {
      console.log('[SkipOn] ✅ Joined chat room:', data.roomId, 'Partner:', data.partnerId);
      // Note: onRoomReadyCallback is now called in handleMatch after join confirmation
      // This handler is kept for backward compatibility
      if (this.onRoomReadyCallback && data.roomId === this.currentRoomId) {
        console.log('[SkipOn] ✅ Calling onRoomReadyCallback from event handler');
        this.onRoomReadyCallback();
      }
    });

    // Partner left
    this.socket.on('skipon_partner_left', (data: { roomId: string; userId: string }) => {
      console.log('[SkipOn] 🚪 Partner left room:', data.roomId);
      if (this.onRoomEndedCallback) {
        this.onRoomEndedCallback();
      }
    });

    // Error handler
    this.socket.on('skipon_error', (error: { message: string }) => {
      console.error('[SkipOn] ❌ Socket.IO error:', error.message);
    });
  }

  /**
   * Start searching for a chat partner
   */
  async startChat(
    clientId: string,
    onMatched: (roomId: string, partnerId?: string, partnerName?: string) => void,
    onMessage: (message: ChatMessageData) => void,
    onPartnerLeft: () => void,
    onError?: (error: string) => void,
    onRoomReady?: () => void
  ): Promise<void> {
    try {
      this.currentUserId = clientId;
      this.onMatchFoundCallback = onMatched;
      this.onMessageCallback = onMessage;
      this.onRoomEndedCallback = onPartnerLeft;
      this.onRoomReadyCallback = onRoomReady || null;

      console.log('[SkipOn] Starting matchmaking for user:', clientId);
      console.log('[SkipOn] Callbacks set - onMatched:', typeof onMatched, 'onMessage:', typeof onMessage);

      // CRITICAL: Set isSearching BEFORE making API call
      // This ensures UI shows "searching" state even if request fails or user is immediately matched
      this.isSearching = true;
      console.log('[SkipOn] ✅ Set isSearching=true before API call');

      // Start matchmaking
      await this.startMatchmaking();

    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start chat';
      console.error('[SkipOn] startChat error:', errorMsg);
      // Reset searching state on error
      this.isSearching = false;
      if (onError) {
        onError(errorMsg);
      }
      throw error;
    }
  }

  /**
   * Start matchmaking (polling REST API)
   */
  private async startMatchmaking(): Promise<void> {
    // Note: isSearching is already set to true in startChat() before this is called
    // This check prevents duplicate matchmaking attempts
    if (this.isSearching && this.matchPollingInterval) {
      console.log('[SkipOn] Already searching and polling, skipping');
      return;
    }

    // Ensure isSearching is true (should already be set, but double-check)
    this.isSearching = true;
    console.log('[SkipOn] 🔍 Starting matchmaking, isSearching set to:', this.isSearching);

    // Initial match request
    try {
      console.log('[SkipOn] Making initial match request...');
      const result = await skipOnRESTService.match();
      console.log('[SkipOn] Initial match result received:', result);
      
      // Handle null response (demo mode or backend unavailable)
      if (!result || result === null) {
        console.error('[SkipOn] ❌ Null result from match()');
        throw new Error('Backend server is not available. Please ensure the FastAPI server is running.');
      }
      
      console.log('[SkipOn] Handling match result...');
      await this.handleMatchResult(result);
      console.log('[SkipOn] Match result handled, isSearching:', this.isSearching);
    } catch (error: any) {
      console.error('[SkipOn] ❌ Match error:', error);
      console.error('[SkipOn] Error stack:', error.stack);
      this.isSearching = false;
      throw error;
    }

    // If searching, poll for status
    console.log('[SkipOn] Checking if should start polling, isSearching:', this.isSearching);
    if (this.isSearching) {
      console.log('[SkipOn] ✅ Starting status polling...');
      this.startStatusPolling();
    } else {
      console.log('[SkipOn] ⚠️ Not starting polling because isSearching is false');
    }
  }

  /**
   * Poll for match status
   */
  private startStatusPolling(): void {
    console.log('[SkipOn] 🚀 startStatusPolling called');
    
    // Clear existing interval
    if (this.matchPollingInterval) {
      console.log('[SkipOn] Clearing existing polling interval');
      clearInterval(this.matchPollingInterval);
    }

    console.log('[SkipOn] Setting up polling interval (every 1.5 seconds)');
    
    // Poll every 1.5 seconds - try match first, then check status
    this.matchPollingInterval = setInterval(async () => {
      console.log('[SkipOn] 🔄 Polling tick - isSearching:', this.isSearching);
      
      if (!this.isSearching) {
        console.log('[SkipOn] ⏹️ Stopping polling because isSearching is false');
        this.stopStatusPolling();
        return;
      }

      try {
        console.log('[SkipOn] Making polling match request...');
        // Try match again (in case someone joined queue)
        // This is safe because backend now handles already-in-queue users
        const result = await skipOnRESTService.match();
        console.log('[SkipOn] Polling match result:', result);
        
        if (result.status === 'matched' && result.roomId) {
          // Match found!
          console.log('[SkipOn] 🎉 Match found during polling!');
          this.stopStatusPolling();
          this.isSearching = false;
          await this.handleMatch(result);
        } else if (result.status === 'searching') {
          // Still searching, continue polling
          console.log('[SkipOn] Still searching... (queue length check)');
        } else {
          console.warn('[SkipOn] ⚠️ Unexpected status in polling:', result.status);
        }
      } catch (error: any) {
        console.error('[SkipOn] ❌ Status polling error:', error);
        console.error('[SkipOn] Error details:', error.message, error.stack);
        // Continue polling on error
      }
    }, 1500);
    
    console.log('[SkipOn] ✅ Polling interval set up, interval ID:', this.matchPollingInterval);
  }

  /**
   * Stop status polling
   */
  private stopStatusPolling(): void {
    if (this.matchPollingInterval) {
      clearInterval(this.matchPollingInterval);
      this.matchPollingInterval = null;
    }
  }

  /**
   * Handle match result
   */
  private async handleMatchResult(result: MatchResult | null): Promise<void> {
    console.log('[SkipOn] handleMatchResult called with:', result);
    
    if (!result) {
      console.error('[SkipOn] ❌ Null result in handleMatchResult');
      throw new Error('Backend server is not available. Please ensure the FastAPI server is running.');
    }
    
    console.log('[SkipOn] Match result status:', result.status);
    console.log('[SkipOn] Match result roomId:', result.roomId);
    
    if (result.status === 'matched' && result.roomId) {
      // CRITICAL: Only proceed if we have a valid partnerId
      // This prevents creating Firebase rooms when users aren't actually matched
      if (!result.partnerId || result.partnerId.trim() === '') {
        console.error('[SkipOn] ❌ Backend returned "matched" but no partnerId - this is invalid!');
        console.error('[SkipOn] ❌ Rejecting match - user is not actually matched with anyone');
        console.error('[SkipOn] ❌ Result:', result);
        // Don't create Firebase room - stay in searching mode
        this.isSearching = true;
        return; // Don't call handleMatch - this prevents Firebase room creation
      }
      
      // Immediate match with valid partner
      console.log('[SkipOn] ✅ Immediate match found with partner:', result.partnerId);
      this.isSearching = false;
      this.stopStatusPolling();
      await this.handleMatch(result);
    } else if (result.status === 'searching') {
      // In queue, start polling
      console.log('[SkipOn] 🔍 In queue, waiting for match...');
      console.log('[SkipOn] isSearching is:', this.isSearching, '- will start polling');
      // CRITICAL: Ensure isSearching stays true so polling starts
      this.isSearching = true;
      console.log('[SkipOn] ✅ Set isSearching to true for polling');
    } else {
      console.error('[SkipOn] ❌ Invalid match result:', result);
      throw new Error(`Invalid match result: ${JSON.stringify(result)}`);
    }
  }

  /**
   * Handle successful match
   */
  private async handleMatch(result: MatchResult): Promise<void> {
    if (!result.roomId || !this.currentUserId) {
      console.error('[SkipOn] Invalid match result:', result);
      return;
    }

    this.isSearching = false;
    this.currentRoomId = result.roomId;

    console.log('[SkipOn] 🎉 Match found! Room:', result.roomId);
    console.log('[SkipOn] Current user ID:', this.currentUserId);
    console.log('[SkipOn] Partner ID:', result.partnerId);
    console.log('[SkipOn] Callback exists?', !!this.onMatchFoundCallback);

    // IMPORTANT: Notify callback FIRST, before Firebase initialization
    // This ensures the UI updates immediately even if Firebase fails
    if (this.onMatchFoundCallback) {
      console.log('[SkipOn] Calling onMatchFoundCallback with roomId:', result.roomId, 'partnerId:', result.partnerId, 'partnerName:', result.partnerName);
      try {
        // Pass roomId, partnerId, and partnerName to the callback
        this.onMatchFoundCallback(result.roomId, result.partnerId, result.partnerName);
        console.log('[SkipOn] ✅ Callback called successfully');
      } catch (error) {
        console.error('[SkipOn] ❌ Error in onMatchFoundCallback:', error);
      }
    } else {
      console.error('[SkipOn] ❌ onMatchFoundCallback is null!');
    }

    // CRITICAL: Only proceed if we have BOTH roomId AND partnerId
    if (!result.roomId) {
      console.error('[SkipOn] ❌ Cannot join chat room: missing roomId');
      return;
    }
    
    if (!result.partnerId) {
      console.error('[SkipOn] ❌ Cannot join chat room: missing partnerId - not a real match');
      return;
    }
    
    // Initialize Socket.IO connection and join chat room
    try {
      console.log('[SkipOn] Initializing Socket.IO connection...');
      this.initializeSocket();
      
      // Wait for socket to connect (increased timeout to 20 seconds)
      if (!this.socket?.connected) {
        console.log('[SkipOn] Waiting for socket connection...');
        await new Promise<void>((resolve, reject) => {
          if (!this.socket) {
            reject(new Error('Socket not initialized'));
            return;
          }
          
          const timeout = setTimeout(() => {
            reject(new Error('Socket connection timeout'));
          }, 20000); // Increased from 5000 to 20000 (20 seconds)
          
          this.socket.once('connect', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          this.socket.once('connect_error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      }
      
      // Set up event listeners BEFORE emitting join event
      let roomJoined = false;
      await new Promise<void>((resolve, reject) => {
        if (!this.socket || !this.socket.connected) {
          console.error('[SkipOn] ❌ Socket not connected for room join');
          reject(new Error('Socket.IO not connected'));
          return;
        }
        
        const timeout = setTimeout(() => {
          console.warn('[SkipOn] ⚠️ Room join confirmation timeout - proceeding anyway');
          // Don't reject - allow messages to be sent even if confirmation is delayed
          resolve();
        }, 10000); // Increased to 10 seconds
        
        const onRoomJoined = (data: { roomId: string; partnerId: string }) => {
          if (data.roomId === result.roomId) {
            clearTimeout(timeout);
            this.socket?.off('skipon_room_joined', onRoomJoined);
            this.socket?.off('skipon_error', onError);
            console.log('[SkipOn] ✅ Room join confirmed via event');
            roomJoined = true;
            resolve();
          }
        };
        
        const onError = (error: { message: string }) => {
          console.error('[SkipOn] ❌ Room join error:', error.message);
          // Don't reject - try to proceed anyway
          clearTimeout(timeout);
          this.socket?.off('skipon_room_joined', onRoomJoined);
          this.socket?.off('skipon_error', onError);
          resolve();
        };
        
        // Set up listeners FIRST
        this.socket.on('skipon_room_joined', onRoomJoined);
        this.socket.on('skipon_error', onError);
        
        // THEN emit the join event
        console.log('[SkipOn] Joining Socket.IO chat room...');
        console.log('[SkipOn] Room ID:', result.roomId);
        console.log('[SkipOn] Current User ID:', this.currentUserId);
        console.log('[SkipOn] Partner ID:', result.partnerId);
        
        this.socket.emit('skipon_join_chat_room', {
          roomId: result.roomId,
          userId: this.currentUserId,
        });
        
        console.log('[SkipOn] ✅ Socket.IO chat room join request sent');
        
        // Clean up listeners after timeout
        setTimeout(() => {
          this.socket?.off('skipon_room_joined', onRoomJoined);
          this.socket?.off('skipon_error', onError);
        }, 5000);
        
        // Wait a moment for socket to fully connect
        // await new Promise(resolve => setTimeout(resolve, 500));
      });
      
      // Call room ready callback - always call it, even if room join confirmation timed out
      // This allows messages to be sent if the server processed the join but didn't send confirmation
      if (this.onRoomReadyCallback) {
        console.log('[SkipOn] ✅ Calling onRoomReadyCallback (roomJoined:', roomJoined, ')');
        this.onRoomReadyCallback();
      } else {
        console.error('[SkipOn] ❌ onRoomReadyCallback is null!');
      }
    } catch (error: any) {
      console.error('[SkipOn] ❌ Failed to initialize Socket.IO:', error);
      console.error('[SkipOn] Error details:', error.message, error.stack);
      // Even if Socket.IO fails, call room ready callback so messages can be sent
      // The REST API matchmaking is working, so we should allow chat to proceed
      console.warn('[SkipOn] ⚠️ Socket.IO initialization failed, but calling onRoomReadyCallback anyway');
      if (this.onRoomReadyCallback) {
        // Delay a bit to let things settle
        setTimeout(() => {
          console.log('[SkipOn] ✅ Calling onRoomReadyCallback after Socket.IO error (fallback)');
          this.onRoomReadyCallback!();
        }, 1000);
      }
    }
  }

  /**
   * Send a message via Socket.IO
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.currentRoomId || !this.currentUserId) {
      throw new Error('Not in a room');
    }

    if (!this.socket) {
      console.error('[SkipOn] ❌ Socket not initialized');
      throw new Error('Socket.IO not initialized');
    }

    if (!this.socket.connected) {
      console.error('[SkipOn] ❌ Socket.IO not connected');
      throw new Error('Socket.IO not connected');
    }

    if (!message.trim()) {
      throw new Error('Message cannot be empty');
    }

    try {
      console.log('[SkipOn] 📤 Sending message via Socket.IO:', message.substring(0, 50));
      this.socket.emit('skipon_send_message', {
        roomId: this.currentRoomId,
        userId: this.currentUserId,
        message: message.trim(),
      });
      console.log('[SkipOn] ✅ Message sent via Socket.IO');
    } catch (error: any) {
      console.error('[SkipOn] ❌ Error sending message:', error);
      throw error;
    }
  }

  /**
   * Skip current chat
   */
  async skipChat(): Promise<void> {
    // Leave Socket.IO chat room
    if (this.currentRoomId && this.socket?.connected) {
      try {
        this.socket.emit('skipon_leave_chat_room', {
          roomId: this.currentRoomId,
          userId: this.currentUserId,
        });
        console.log('[SkipOn] ✅ Left Socket.IO chat room');
      } catch (error) {
        console.error('[SkipOn] Error leaving Socket.IO room:', error);
      }
    }

    // Leave via REST API
    try {
      await skipOnRESTService.leave();
    } catch (error) {
      console.error('[SkipOn] Error leaving via REST:', error);
    }

    // Cleanup
    this.cleanup();
  }

  /**
   * Disconnect (alias for cleanup)
   */
  disconnect(): void {
    this.cleanup();
  }

  /**
   * Clean up all connections and reset state
   */
  cleanup(): void {
    console.log('[SkipOn] 🧹 Cleaning up...');

    // Stop polling
    this.stopStatusPolling();

    // Leave queue/room (best effort - don't fail if server is down)
    skipOnRESTService.leave().catch((error) => {
      // Silently ignore errors during cleanup - server might be down
      console.log('[SkipOn] Cleanup: Leave request failed (non-critical):', error.message || 'Server unavailable');
    });

    // Leave Socket.IO chat room
    if (this.currentRoomId && this.socket?.connected) {
      try {
        this.socket.emit('skipon_leave_chat_room', {
          roomId: this.currentRoomId,
          userId: this.currentUserId,
        });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    // Disconnect Socket.IO
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    // Reset state
    this.currentRoomId = null;
    this.currentUserId = null;
    this.onMatchFoundCallback = null;
    this.onMessageCallback = null;
    this.onRoomEndedCallback = null;
    this.isSearching = false;

    console.log('[SkipOn] ✅ Cleanup complete');
  }

  /**
   * Get current room ID
   */
  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): { connected: boolean; searching: boolean; roomId: string | null } {
    return {
      connected: !!this.currentRoomId,
      searching: this.isSearching,
      roomId: this.currentRoomId,
    };
  }
}

export default new SkipOnService();
