/**
 * Watch Along Firebase Realtime Database Service
 * 
 * Handles chat messages for Watch Along rooms via Firebase Realtime Database
 * 
 * Firebase Structure:
 * watchAlongRooms/
 *   {roomId}/
 *     messages/
 *       {messageId}/
 *         senderId: string
 *         text: string
 *         timestamp: number
 *         senderName?: string
 */

import { getDatabase, ref, push, onChildAdded, off, set, Database } from 'firebase/database';
import { getFirebaseApp } from './firebase';

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  senderName?: string;
}

class WatchAlongFirebaseService {
  private db: Database | null = null;
  private currentRoomId: string | null = null;
  private messageListener: (() => void) | null = null;

  constructor() {
    try {
      const app = getFirebaseApp();
      if (app) {
        this.db = getDatabase(app);
        console.log('✅ WatchAlongFirebaseService: Firebase Realtime Database initialized');
      } else {
        console.warn('⚠️ WatchAlongFirebaseService: Firebase app not initialized');
      }
    } catch (error: any) {
      console.error('❌ WatchAlongFirebaseService: Failed to initialize:', error);
    }
  }

  /**
   * Initialize room in Firebase
   */
  async initializeRoom(roomId: string): Promise<void> {
    console.log(`🏗️ WatchAlongFirebase: Initializing room: ${roomId}`);
    
    if (!this.db) {
      console.error('❌ WatchAlongFirebase: Database not initialized!');
      throw new Error('Firebase Database not initialized');
    }

    this.currentRoomId = roomId;
    const roomRef = ref(this.db, `watchAlongRooms/${roomId}`);
    
    // Ensure room exists (create if it doesn't)
    const messagesRef = ref(this.db, `watchAlongRooms/${roomId}/messages`);
    
    console.log(`✅ WatchAlongFirebase: Room ${roomId} initialized`);
  }

  /**
   * Send a message to the room
   */
  async sendMessage(text: string, senderId: string, senderName?: string): Promise<void> {
    if (!this.db || !this.currentRoomId) {
      throw new Error('Room not initialized');
    }

    const messagesRef = ref(this.db, `watchAlongRooms/${this.currentRoomId}/messages`);
    
    const messageData = {
      senderId,
      text: text.trim(),
      timestamp: Date.now(),
      senderName: senderName || `User ${senderId.substring(0, 8)}`,
    };

    try {
      await push(messagesRef, messageData);
      console.log(`✅ WatchAlongFirebase: Message sent to room ${this.currentRoomId}`);
    } catch (error: any) {
      console.error('❌ WatchAlongFirebase: Error sending message:', error);
      throw error;
    }
  }

  /**
   * Subscribe to messages in the room
   */
  subscribeToMessages(
    onMessage: (message: ChatMessage) => void
  ): void {
    if (!this.db || !this.currentRoomId) {
      console.error('❌ WatchAlongFirebase: Cannot subscribe - room not initialized');
      return;
    }

    // Clean up existing listener
    this.unsubscribeFromMessages();

    const messagesRef = ref(this.db, `watchAlongRooms/${this.currentRoomId}/messages`);
    
    console.log(`📡 WatchAlongFirebase: Subscribing to messages in room ${this.currentRoomId}`);

    this.messageListener = onChildAdded(messagesRef, (snapshot) => {
      if (snapshot.exists()) {
        const messageData = snapshot.val();
        const message: ChatMessage = {
          id: snapshot.key || `msg_${Date.now()}`,
          senderId: messageData.senderId,
          text: messageData.text,
          timestamp: messageData.timestamp,
          senderName: messageData.senderName,
        };
        
        console.log(`📨 WatchAlongFirebase: New message received:`, message.text.substring(0, 50));
        onMessage(message);
      }
    }, (error) => {
      console.error('❌ WatchAlongFirebase: Error listening to messages:', error);
    });
  }

  /**
   * Unsubscribe from messages
   */
  unsubscribeFromMessages(): void {
    if (this.messageListener) {
      this.messageListener();
      this.messageListener = null;
      console.log('🔇 WatchAlongFirebase: Unsubscribed from messages');
    }
  }

  /**
   * Clean up (unsubscribe and clear room)
   */
  cleanup(): void {
    this.unsubscribeFromMessages();
    this.currentRoomId = null;
    console.log('🧹 WatchAlongFirebase: Cleaned up');
  }
}

// Export singleton instance
const watchAlongFirebaseService = new WatchAlongFirebaseService();
export default watchAlongFirebaseService;

