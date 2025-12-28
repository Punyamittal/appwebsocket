/**
 * Skip On Service (REST + Firebase)
 * 
 * Architecture:
 * - Matchmaking: REST API (server-authoritative)
 * - Chat: Firebase Realtime Database
 * - NO Socket.IO
 * 
 * Works for both authenticated and guest users
 */

import skipOnRESTService, { MatchResult } from './skipOnRESTService';
import skipOnFirebaseService, { ChatMessage } from './skipOnFirebaseService';

export interface ChatMessageData {
  id: string;
  sender_id: string;
  message: string;
  timestamp: string;
  created_at: string;
}

class SkipOnService {
  private currentRoomId: string | null = null;
  private currentUserId: string | null = null;
  private onMatchFoundCallback: ((roomId: string, partnerId?: string, partnerName?: string) => void) | null = null;
  private onMessageCallback: ((message: ChatMessageData) => void) | null = null;
  private onRoomEndedCallback: (() => void) | null = null;
  private firebaseCleanup: (() => void) | null = null;
  private isSearching: boolean = false;
  private matchPollingInterval: NodeJS.Timeout | null = null;

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
      this.onRoomReadyCallback = onRoomReady;
      this.onRoomReadyCallback = onRoomReady;

      console.log('[SkipOn] Starting matchmaking for user:', clientId);
      console.log('[SkipOn] Callbacks set - onMatched:', typeof onMatched, 'onMessage:', typeof onMessage);

      // Start matchmaking
      await this.startMatchmaking();

    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start chat';
      console.error('[SkipOn] startChat error:', errorMsg);
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
    if (this.isSearching) {
      console.log('[SkipOn] Already searching, skipping');
      return;
    }

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
      // Immediate match
      console.log('[SkipOn] ✅ Immediate match found!');
      this.isSearching = false;
      this.stopStatusPolling();
      await this.handleMatch(result);
    } else if (result.status === 'searching') {
      // In queue, start polling
      console.log('[SkipOn] 🔍 In queue, waiting for match...');
      console.log('[SkipOn] isSearching is:', this.isSearching, '- will start polling');
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

    // Initialize Firebase room (non-blocking)
    try {
      console.log('[SkipOn] Initializing Firebase room...');
      console.log('[SkipOn] Room ID:', result.roomId);
      console.log('[SkipOn] Current User ID:', this.currentUserId);
      console.log('[SkipOn] Partner ID:', result.partnerId || '');
      
      await skipOnFirebaseService.initializeRoom(
        result.roomId,
        this.currentUserId,
        result.partnerId || ''
      );
      console.log('[SkipOn] ✅ Firebase room initialized successfully');
    } catch (error: any) {
      console.error('[SkipOn] ❌ Failed to initialize Firebase room:', error);
      console.error('[SkipOn] Error details:', error.message, error.stack);
      // Continue anyway - Firebase might work later
    }

    // Subscribe to Firebase messages
    try {
      console.log('[SkipOn] Subscribing to Firebase messages...');
      this.firebaseCleanup = skipOnFirebaseService.subscribeToMessages(
        result.roomId,
        this.currentUserId,
        (message: ChatMessage) => {
          console.log('[SkipOn] 📨 Firebase message received:', message);
          // Convert Firebase message to ChatMessageData format
          const messageData: ChatMessageData = {
            id: message.id,
            sender_id: message.senderId,
            message: message.text,
            timestamp: new Date(message.timestamp).toISOString(),
            created_at: new Date(message.timestamp).toISOString(),
          };

          if (this.onMessageCallback) {
            console.log('[SkipOn] Calling onMessageCallback with:', messageData);
            this.onMessageCallback(messageData);
          } else {
            console.warn('[SkipOn] ⚠️ onMessageCallback is null!');
          }
        },
        () => {
          console.log('[SkipOn] 🚪 Partner left (from Firebase)');
          // Partner left
          if (this.onRoomEndedCallback) {
            this.onRoomEndedCallback();
          }
        },
        () => {
          console.log('[SkipOn] ✅ Room is ready - both users joined');
          // Room is ready - notify callback
          if (this.onRoomReadyCallback) {
            this.onRoomReadyCallback();
          }
        }
      );
      console.log('[SkipOn] ✅ Firebase message subscription active');
    } catch (error: any) {
      console.error('[SkipOn] ❌ Failed to subscribe to Firebase messages:', error);
      console.error('[SkipOn] Error details:', error.message, error.stack);
      // Continue anyway - messages might work later
    }
  }

  /**
   * Send a message
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.currentRoomId || !this.currentUserId) {
      throw new Error('Not in a room');
    }

    try {
      await skipOnFirebaseService.sendMessage(
        this.currentRoomId,
        this.currentUserId,
        message
      );
      console.log('[SkipOn] ✅ Message sent');
    } catch (error: any) {
      console.error('[SkipOn] ❌ Error sending message:', error);
      throw error;
    }
  }

  /**
   * Skip current chat
   */
  async skipChat(): Promise<void> {
    if (this.currentRoomId) {
      try {
        // Mark room as ended in Firebase
        await skipOnFirebaseService.endRoom(this.currentRoomId);
      } catch (error) {
        console.error('[SkipOn] Error ending Firebase room:', error);
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

    // Cleanup Firebase
    if (this.firebaseCleanup) {
      this.firebaseCleanup();
      this.firebaseCleanup = null;
    }
    skipOnFirebaseService.cleanup();

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
