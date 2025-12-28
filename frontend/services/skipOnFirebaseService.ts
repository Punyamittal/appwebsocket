/**
 * Skip On Firebase Realtime Database Service
 * 
 * Handles chat messages via Firebase Realtime Database
 * Matchmaking is handled via REST API (see skipOnService.ts)
 * 
 * Firebase Structure:
 * skipOnRooms/
 *   {roomId}/
 *     users/
 *       userAId: true
 *       userBId: true
 *     messages/
 *       {messageId}/
 *         senderId: string
 *         text: string
 *         timestamp: number
 *     status: "active" | "ended"
 */

import { getDatabase, ref, push, onValue, onChildAdded, off, set, get, Database } from 'firebase/database';
import { getFirebaseApp } from './firebase';

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
}

class SkipOnFirebaseService {
  private db: Database | null = null;
  private currentRoomId: string | null = null;
  private messageListeners: Array<() => void> = [];
  private statusListener: (() => void) | null = null;

  constructor() {
    try {
      const app = getFirebaseApp();
      if (app) {
        this.db = getDatabase(app);
        console.log('✅ SkipOnFirebaseService: Firebase Realtime Database initialized');
        console.log('✅ SkipOnFirebaseService: Database URL:', this.db.app.options.databaseURL);
        
        // Test connection by trying to read from a test path
        const testRef = ref(this.db, '.info/connected');
        onValue(testRef, (snapshot) => {
          const connected = snapshot.val();
          console.log(`🔌 SkipOnFirebase: Connection status: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
        }, (error) => {
          console.error('❌ SkipOnFirebase: Connection test error:', error);
        });
      } else {
        console.warn('⚠️ SkipOnFirebaseService: Firebase app not initialized');
      }
    } catch (error: any) {
      console.error('❌ SkipOnFirebaseService: Failed to initialize:', error);
      console.error('❌ SkipOnFirebaseService: Error details:', error.message, error.stack);
    }
  }

  /**
   * Initialize room in Firebase
   * Called after match is confirmed
   */
  async initializeRoom(roomId: string, userId: string, partnerId: string): Promise<void> {
    console.log(`🏗️ SkipOnFirebase: initializeRoom called - roomId: ${roomId}, userId: ${userId}, partnerId: ${partnerId}`);
    
    if (!this.db) {
      console.error('❌ SkipOnFirebase: Database not initialized!');
      throw new Error('Firebase Database not initialized');
    }

    console.log(`🏗️ SkipOnFirebase: Database is initialized, creating/joining room...`);
    this.currentRoomId = roomId;

    const roomRef = ref(this.db, `skipOnRooms/${roomId}`);
    console.log(`🏗️ SkipOnFirebase: Room ref path: skipOnRooms/${roomId}`);
    
    // Check if room already exists (partner might have created it)
    const existingRoom = await get(roomRef);
    
    if (existingRoom.exists()) {
      // Room exists - mark this user as joined
      console.log(`🏗️ SkipOnFirebase: Room exists, marking user ${userId} as joined`);
      const userRef = ref(this.db, `skipOnRooms/${roomId}/users/${userId}`);
      await set(userRef, {
        joined: true,
        joinedAt: Date.now(),
      });
      
      // Update user count and check if both users are joined
      const roomData = existingRoom.val();
      const users = roomData?.users || {};
      const joinedUsers = Object.keys(users).filter((uid) => {
        const userData = users[uid];
        return userData === true || (typeof userData === 'object' && userData?.joined === true);
      });
      const userCount = joinedUsers.length;
      
      console.log(`🏗️ SkipOnFirebase: User count after join: ${userCount}`);
      
      // If both users are now joined, activate room
      if (userCount >= 2) {
        const statusRef = ref(this.db, `skipOnRooms/${roomId}/status`);
        await set(statusRef, 'active');
        console.log(`✅ SkipOnFirebase: Room activated - both users joined`);
      }
    } else {
      // Room doesn't exist - create it
      console.log(`🏗️ SkipOnFirebase: Creating new room`);
      const roomData = {
        users: {
          [userId]: {
            joined: true,
            joinedAt: Date.now(),
          },
          [partnerId]: {
            joined: false, // Partner hasn't joined yet
            joinedAt: null,
          },
        },
        status: 'waiting', // 'waiting' until both join, then 'active'
        createdAt: Date.now(),
      };
      
      console.log(`🏗️ SkipOnFirebase: Room data to write:`, roomData);
      
      try {
        await set(roomRef, roomData);
        console.log(`✅ SkipOnFirebase: Room ${roomId} created in Firebase`);
      } catch (error: any) {
        console.error(`❌ SkipOnFirebase: Error creating room:`, error);
        throw error;
      }
    }
    
    // Verify room was created/updated
    const verifyRef = ref(this.db, `skipOnRooms/${roomId}`);
    const verifySnapshot = await get(verifyRef);
    if (verifySnapshot.exists()) {
      console.log(`✅ SkipOnFirebase: Room verified in Firebase:`, verifySnapshot.val());
    } else {
      console.error(`❌ SkipOnFirebase: Room was not created in Firebase!`);
    }
  }

  /**
   * Send a message to Firebase
   */
  async sendMessage(roomId: string, senderId: string, text: string): Promise<void> {
    console.log(`📤 SkipOnFirebase: sendMessage called - roomId: ${roomId}, senderId: ${senderId}, text: "${text}"`);
    
    if (!this.db) {
      console.error('❌ SkipOnFirebase: Database not initialized');
      throw new Error('Firebase Database not initialized');
    }

    if (!roomId || !senderId || !text.trim()) {
      console.error(`❌ SkipOnFirebase: Missing required fields - roomId: ${roomId}, senderId: ${senderId}, text: "${text}"`);
      throw new Error('roomId, senderId, and text are required');
    }
    
    // Check if room is active (both users joined)
    const roomRef = ref(this.db, `skipOnRooms/${roomId}`);
    const roomSnapshot = await get(roomRef);
    
    if (!roomSnapshot.exists()) {
      throw new Error('Room does not exist');
    }
    
    const roomData = roomSnapshot.val();
    const status = roomData?.status;
    const users = roomData?.users || {};
    const joinedUsers = Object.keys(users).filter((uid) => users[uid]?.joined === true);
    const userCount = joinedUsers.length;
    
    console.log(`📤 SkipOnFirebase: Room status: ${status}, userCount: ${userCount}`);
    
    if (status !== 'active' || userCount < 2) {
      throw new Error('Room is not ready. Waiting for partner to join...');
    }

    const messagesRef = ref(this.db, `skipOnRooms/${roomId}/messages`);
    console.log(`📤 SkipOnFirebase: Messages ref path: skipOnRooms/${roomId}/messages`);
    
    const newMessageRef = push(messagesRef);
    console.log(`📤 SkipOnFirebase: New message ref created: ${newMessageRef.key}`);

    const messageData = {
      senderId,
      text: text.trim(),
      timestamp: Date.now(),
    };
    
    console.log(`📤 SkipOnFirebase: Setting message data:`, messageData);
    
    try {
      await set(newMessageRef, messageData);
      const messageId = newMessageRef.key;
      console.log(`✅ SkipOnFirebase: Message sent successfully to room ${roomId}, messageId: ${messageId}`);
      
      // Verify message was written by reading it back
      try {
        const verifyRef = ref(this.db, `skipOnRooms/${roomId}/messages/${messageId}`);
        const verifySnapshot = await get(verifyRef);
        if (verifySnapshot.exists()) {
          console.log(`✅ SkipOnFirebase: Message verified in Firebase:`, verifySnapshot.val());
        } else {
          console.warn(`⚠️ SkipOnFirebase: Message sent but not found in Firebase!`);
        }
      } catch (verifyError) {
        console.warn(`⚠️ SkipOnFirebase: Could not verify message (non-critical):`, verifyError);
      }
    } catch (error: any) {
      console.error(`❌ SkipOnFirebase: Error sending message:`, error);
      console.error(`❌ SkipOnFirebase: Error code:`, error.code);
      console.error(`❌ SkipOnFirebase: Error message:`, error.message);
      console.error(`❌ SkipOnFirebase: Error details:`, error.stack);
      throw error;
    }
  }

  /**
   * Subscribe to messages in a room
   * Returns cleanup function
   */
  subscribeToMessages(
    roomId: string,
    currentUserId: string,
    onMessage: (message: ChatMessage) => void,
    onPartnerLeft?: () => void,
    onRoomReady?: () => void
  ): () => void {
    if (!this.db) {
      console.error('❌ SkipOnFirebase: Database not initialized');
      return () => {};
    }

    this.currentRoomId = roomId;

    // Listen for new messages
    const messagesRef = ref(this.db, `skipOnRooms/${roomId}/messages`);
    console.log(`📡 SkipOnFirebase: Setting up listener for room ${roomId}, currentUserId: ${currentUserId}`);
    console.log(`📡 SkipOnFirebase: Messages path: skipOnRooms/${roomId}/messages`);
    
    // Track processed message IDs to avoid duplicates
    const processedMessageIds = new Set<string>();
    let isInitialLoad = true;
    
    // Use onValue to listen to ALL changes (more reliable than onChildAdded alone)
    // This catches messages even if they arrive while listener is being set up
    const unsubscribeMessages = onValue(messagesRef, (snapshot) => {
      console.log(`📡 SkipOnFirebase: onValue triggered, snapshot exists: ${snapshot.exists()}, isInitialLoad: ${isInitialLoad}`);
      
      if (!snapshot.exists()) {
        console.log(`📡 SkipOnFirebase: Snapshot doesn't exist (no messages yet)`);
        isInitialLoad = false;
        return;
      }

      const messages = snapshot.val();
      const messageKeys = Object.keys(messages || {});
      console.log(`📡 SkipOnFirebase: Received ${messageKeys.length} total messages from Firebase`);
      console.log(`📡 SkipOnFirebase: Already processed ${processedMessageIds.size} messages`);
      
      // On initial load, process all messages
      // On subsequent updates, only process new ones
      let newMessagesCount = 0;
      messageKeys.forEach((messageId) => {
        // Skip if already processed (unless it's initial load)
        if (!isInitialLoad && processedMessageIds.has(messageId)) {
          return;
        }
        
        // Mark as processed
        if (!processedMessageIds.has(messageId)) {
          processedMessageIds.add(messageId);
          newMessagesCount++;
        }

        const data = messages[messageId];
        if (!data) {
          console.log(`📡 SkipOnFirebase: Message ${messageId} has no data, skipping`);
          return;
        }

        console.log(`📡 SkipOnFirebase: Processing message - ID: ${messageId}, senderId: ${data.senderId}, currentUserId: ${currentUserId}`);

        // Don't process own messages (they're added optimistically)
        if (data.senderId === currentUserId) {
          console.log(`📡 SkipOnFirebase: Ignoring own message from ${currentUserId}`);
          return;
        }

        const message: ChatMessage = {
          id: messageId,
          senderId: data.senderId,
          text: data.text,
          timestamp: data.timestamp,
        };

        console.log(`📨 SkipOnFirebase: ✅ Processing message from ${data.senderId}: "${data.text}"`);
        onMessage(message);
      });
      
      console.log(`📡 SkipOnFirebase: Processed ${newMessagesCount} new messages (total in Firebase: ${messageKeys.length})`);
      isInitialLoad = false;
    }, (error) => {
      console.error(`❌ SkipOnFirebase: Error in onValue listener:`, error);
      console.error(`❌ SkipOnFirebase: Error code:`, error.code);
      console.error(`❌ SkipOnFirebase: Error message:`, error.message);
    });
    
    console.log(`📡 SkipOnFirebase: Listener set up, waiting for messages...`);

    // Listen for room status changes (partner joined, partner left)
    const roomRef = ref(this.db, `skipOnRooms/${roomId}`);
    
    const unsubscribeStatus = onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) return;

      const roomData = snapshot.val();
      const status = roomData?.status;
      const users = roomData?.users || {};
      const joinedUsers = Object.keys(users).filter((uid) => {
        const userData = users[uid];
        return userData === true || (typeof userData === 'object' && userData?.joined === true);
      });
      const userCount = joinedUsers.length;
      
      console.log(`📡 SkipOnFirebase: Room status update - status: ${status}, userCount: ${userCount}`);
      
      // Check if partner left
      if (status === 'ended' && onPartnerLeft) {
        console.log('🚪 SkipOnFirebase: Room ended, partner left');
        onPartnerLeft();
      }
      
      // Update room status to 'active' when both users have joined
      if (userCount === 2 && status === 'waiting') {
        console.log('✅ SkipOnFirebase: Both users joined, activating room');
        const statusRef = ref(this.db, `skipOnRooms/${roomId}/status`);
        set(statusRef, 'active').catch((error) => {
          console.error('❌ SkipOnFirebase: Error updating room status:', error);
        });
      }
      
      // Notify when room is ready (both users joined)
      if (status === 'active' && userCount >= 2 && onRoomReady) {
        console.log('✅ SkipOnFirebase: Room is ready - both users joined');
        onRoomReady();
      }
    });

    // Store cleanup function
    const cleanup = () => {
      try {
        if (typeof unsubscribeMessages === 'function') {
          unsubscribeMessages();
        }
        if (typeof unsubscribeStatus === 'function') {
          unsubscribeStatus();
        }
        processedMessageIds.clear();
        console.log(`🧹 SkipOnFirebase: Unsubscribed from room ${roomId}`);
      } catch (error) {
        console.error('❌ SkipOnFirebase: Error unsubscribing:', error);
      }
    };

    this.messageListeners.push(cleanup);
    this.statusListener = cleanup;

    return cleanup;
  }

  /**
   * Mark room as ended (when user leaves)
   */
  async endRoom(roomId: string): Promise<void> {
    if (!this.db) {
      return;
    }

    const statusRef = ref(this.db, `skipOnRooms/${roomId}/status`);
    await set(statusRef, 'ended');

    console.log(`🚪 SkipOnFirebase: Room ${roomId} marked as ended`);
  }

  /**
   * Clean up all listeners
   */
  cleanup(): void {
    // Clean up all message listeners
    this.messageListeners.forEach(cleanup => cleanup());
    this.messageListeners = [];

    // Clean up status listener
    if (this.statusListener) {
      this.statusListener();
      this.statusListener = null;
    }

    this.currentRoomId = null;
    console.log('🧹 SkipOnFirebase: All listeners cleaned up');
  }

  /**
   * Get current room ID
   */
  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }
}

export default new SkipOnFirebaseService();

