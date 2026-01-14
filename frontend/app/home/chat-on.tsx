/**
 * Skip On - Chat Screen
 * 
 * Clean implementation using new Socket.IO service
 * No Supabase, no database, no polling
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessage } from '../../types';
import { useAuthStore } from '../../store/authStore';
import TopNavigation from '../../components/TopNavigation';
// Skip On Service (REST + Firebase, no Socket.IO)
import skipOnService, { ChatMessage as SkipOnMessage } from '../../services/skipOnService.new';
import skipOnRESTService from '../../services/skipOnRESTService';
import skipOnVideoCallService from '../../services/skipOnVideoCallService';
import VideoCallView from '../../components/VideoCallView';

// Import avatar images
const avatarImages = {
  i1: require('../../assets/images/i1.png'),
  i2: require('../../assets/images/i2.png'),
  i3: require('../../assets/images/i3.png'),
  i4: require('../../assets/images/i4.png'),
  i5: require('../../assets/images/i5.png'),
  i6: require('../../assets/images/i6.png'),
  i7: require('../../assets/images/i7.png'),
};

const getAvatarImage = (avatarKey?: string) => {
  if (avatarKey && avatarKey in avatarImages) {
    return avatarImages[avatarKey as keyof typeof avatarImages];
  }
  return avatarImages.i1;
};

type ChatState = 'idle' | 'searching' | 'chatting' | 'error';

export default function ChatOnScreen() {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [roomReady, setRoomReady] = useState(false); // True when both users are in room
  const flatListRef = useRef<FlatList>(null);
  
  // Video call state
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  // Debug: Watch for roomId changes
  useEffect(() => {
    if (roomId) {
      console.log('[ChatOn] ✅ roomId changed to:', roomId);
      console.log('[ChatOn] Current chatState:', chatState);
      // Ensure state is set to chatting when roomId is set
      if (chatState !== 'chatting') {
        console.log('[ChatOn] ⚠️ roomId set but chatState is not chatting, fixing...');
        setChatState('chatting');
      }
    }
  }, [roomId, chatState]);

  // Get user ID (authenticated or guest)
  const getUserId = async (): Promise<string> => {
    if (user && !user.is_guest && user.id) {
      return user.id;
    }
    // Get or create guest ID (persisted in AsyncStorage)
    return await skipOnRESTService.getGuestId();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[ChatOn] Cleaning up...');
      skipOnService.disconnect();
    };
  }, []);

  /**
   * Start searching for a chat partner
   */
  const handleStartChat = async () => {
    try {
      const userId = await getUserId();
      
      console.log('[ChatOn] Starting chat for user:', userId);
      
      // Set searching state IMMEDIATELY (before API call) so UI shows searching
      // This ensures both users see "searching" even if one gets matched quickly
      setChatState('searching');
      setMessages([]);
      setRoomId(null);
      setInputMessage('');

      // Start chat with callbacks
      // Note: If user is already matched, onMatched will be called and state will update to 'chatting'
      await skipOnService.startChat(
        userId,
        // onMatched - use functional updates to ensure state updates work
        (foundRoomId: string, foundPartnerId?: string, foundPartnerName?: string) => {
          console.log('[ChatOn] 🎉 Match found! Room:', foundRoomId, 'Partner:', foundPartnerId, 'Name:', foundPartnerName);
          console.log('[ChatOn] Current chatState before update:', chatState);
          console.log('[ChatOn] Setting roomId and chatState to chatting...');
          
          // Clear messages - real messages will come from Firebase
          setMessages([]);
          setRoomReady(false); // Room not ready until both users join
          
          // Store partner info if provided
          if (foundPartnerId) {
            setPartnerId(foundPartnerId);
          }
          if (foundPartnerName) {
            setPartnerName(foundPartnerName);
          } else if (foundPartnerId) {
            // Fallback: use partner ID as name
            setPartnerName(foundPartnerId.substring(0, 8));
          }
          
          // Use functional updates to ensure React batches these correctly
          setRoomId((prevRoomId) => {
            console.log('[ChatOn] setRoomId called, prevRoomId:', prevRoomId, 'newRoomId:', foundRoomId);
            return foundRoomId;
          });
          
          setChatState((prevState) => {
            console.log('[ChatOn] setChatState called, prevState:', prevState, 'newState: chatting');
            return 'chatting';
          });
          
          // FALLBACK: Set roomReady after 3 seconds if onRoomReady wasn't called
          // This ensures users can message even if Socket.IO room join fails
          const fallbackTimer = setTimeout(() => {
            setRoomReady((currentReady) => {
              if (!currentReady) {
                console.warn('[ChatOn] ⚠️ Room ready callback not called after 3s, enabling messages anyway (fallback)');
                return true;
              }
              return currentReady;
            });
          }, 3000);
          
          // Store timer so we can clear it if onRoomReady is called
          (window as any).__chatOnFallbackTimer = fallbackTimer;
          
          // Force a re-render check
          setTimeout(() => {
            console.log('[ChatOn] After state update - roomId should be:', foundRoomId);
          }, 100);
        },
        // onMessage
        (message: SkipOnMessage) => {
          console.log('[ChatOn] 📨 Message received:', message.message);
          
          const chatMessage: ChatMessage = {
            message_id: message.id,
            message: message.message,
            timestamp: message.timestamp,
            is_self: false, // Always false - messages from partner
          };
          
          setMessages((prev) => [...prev, chatMessage]);
          
          // Scroll to bottom
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        },
        // onPartnerLeft
        () => {
          console.log('[ChatOn] 🚪 Partner left');
          Alert.alert('Partner Left', 'Your chat partner has left. Starting new search...');
          handleSkip();
        },
        // onError
        (error: string) => {
          console.error('[ChatOn] ❌ Error:', error);
          Alert.alert('Error', error);
          setChatState('error');
        },
        // onRoomReady - called when both users have joined
        () => {
          console.log('[ChatOn] ✅ Room is ready - both users joined');
          // Clear fallback timer if it exists
          if ((window as any).__chatOnFallbackTimer) {
            clearTimeout((window as any).__chatOnFallbackTimer);
            delete (window as any).__chatOnFallbackTimer;
          }
          setRoomReady(true);
        }
      );

    } catch (error: any) {
      console.error('[ChatOn] Error starting chat:', error);
      setChatState('error');
      Alert.alert('Error', error.message || 'Failed to start chat. Please try again.');
      skipOnService.disconnect();
    }
  };

  /**
   * Send a message
   */
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !roomId) {
      return;
    }
    
    // Don't allow messages until room is ready (both users joined)
    if (!roomReady) {
      Alert.alert('Waiting', 'Waiting for partner to join the room...');
      return;
    }

    const messageText = inputMessage.trim();
    setInputMessage('');

    // Optimistically add message to UI
    const optimisticMessage: ChatMessage = {
      message_id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: messageText,
      timestamp: new Date().toISOString(),
      is_self: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    // Scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      await skipOnService.sendMessage(messageText);
      console.log('[ChatOn] ✅ Message sent');
      // Note: Message will appear again from Firebase, but we keep optimistic one
      // Firebase listener filters out own messages, so this is fine
    } catch (error: any) {
      console.error('[ChatOn] ❌ Error sending message:', error);
      Alert.alert('Error', error.message || 'Failed to send message');
      
      // Remove optimistic message on error
      setMessages((prev) => prev.filter(msg => msg.message_id !== optimisticMessage.message_id));
    }
  };

  /**
   * Skip current chat
   */
  const handleSkip = async () => {
    if (roomId) {
      try {
        await skipOnService.skipChat();
        console.log('[ChatOn] ✅ Chat skipped');
      } catch (error) {
        console.error('[ChatOn] Error skipping:', error);
      }
    }

    // Reset state
    setRoomId(null);
    setMessages([]);
    setInputMessage('');
    setChatState('idle');
    setIsVideoCallActive(false);
    skipOnVideoCallService.disconnect();
  };

  /**
   * Start video call
   */
  const handleStartVideoCall = async () => {
    if (!roomId || !partnerId || !user) {
      Alert.alert('Error', 'Cannot start video call');
      return;
    }

    try {
      const userId = user.id || user.guest_uuid || '';
      await skipOnVideoCallService.initiateCall(roomId, userId, partnerId);
      const localStream = skipOnVideoCallService.getLocalStream();
      setLocalStream(localStream);
      setIsVideoCallActive(true);
    } catch (error: any) {
      console.error('[ChatOn] Error starting video call:', error);
      Alert.alert('Error', error.message || 'Failed to start video call');
    }
  };

  /**
   * Answer incoming call
   */
  const handleAnswerCall = async (accepted: boolean) => {
    if (!roomId || !incomingCallerId || !user) {
      return;
    }

    const userId = user.id || user.guest_uuid || '';
    await skipOnVideoCallService.answerCall(roomId, userId, accepted);
    
    if (accepted) {
      const localStream = skipOnVideoCallService.getLocalStream();
      setLocalStream(localStream);
      setIsVideoCallActive(true);
    }
    
    setIsIncomingCall(false);
    setIncomingCallerId(null);
  };

  /**
   * End video call
   */
  const handleEndVideoCall = () => {
    if (roomId && user) {
      const userId = user.id || user.guest_uuid || '';
      skipOnVideoCallService.endCall(roomId, userId);
    }
    setIsVideoCallActive(false);
    setLocalStream(null);
    setRemoteStream(null);
  };

  /**
   * Toggle video
   */
  const handleToggleVideo = () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    skipOnVideoCallService.toggleVideo(newState);
  };

  /**
   * Toggle audio
   */
  const handleToggleAudio = () => {
    const newState = !isAudioEnabled;
    setIsAudioEnabled(newState);
    skipOnVideoCallService.toggleAudio(newState);
  };

  /**
   * Render message bubble
   */
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const userAvatar = user?.avatar_base64 || 'i1';
    
    return (
      <View
        style={[
          styles.messageContainer,
          item.is_self ? styles.myMessageContainer : styles.theirMessageContainer,
        ]}
      >
        {!item.is_self && (
          <View style={styles.messageAvatarContainer}>
            <Image
              source={getAvatarImage('i1')} // Partner avatar - using default for now
              style={styles.messageAvatarImage}
              resizeMode="cover"
            />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            item.is_self ? styles.myMessage : styles.theirMessage,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              item.is_self ? styles.myMessageText : styles.theirMessageText,
            ]}
          >
            {item.message}
          </Text>
        </View>
        {item.is_self && (
          <View style={styles.messageAvatarContainer}>
            <Image
              source={getAvatarImage(userAvatar)}
              style={styles.messageAvatarImage}
              resizeMode="cover"
            />
          </View>
        )}
      </View>
    );
  };

  // ====================================
  // RENDER STATES
  // ====================================

  // Idle or Error State
  if (chatState === 'idle' || chatState === 'error') {
    return (
      <View style={styles.container}>
        <TopNavigation />
        <SafeAreaView style={styles.contentContainer} edges={[]}>
          <View style={styles.startContainer}>
            <View style={styles.profilePictureContainer}>
              <View style={styles.profilePicture}>
                <Image
                  source={getAvatarImage(user?.avatar_base64 || 'i1')}
                  style={styles.profilePictureImage}
                  resizeMode="cover"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartChat}
              disabled={chatState === 'searching'}
            >
              <Text style={styles.startButtonText}>
                {chatState === 'error' ? 'Try Again' : 'Start Chat'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Searching State
  if (chatState === 'searching') {
    return (
      <View style={styles.container}>
        <TopNavigation />
        <SafeAreaView style={styles.contentContainer} edges={[]}>
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="large" color="#4A90E2" />
            <Text style={styles.searchingText}>Connecting...</Text>
            <Text style={styles.searchingSubtext}>Finding someone to chat with</Text>
            <Text style={styles.searchingHint}>
              💡 Tip: Open another browser tab or window to test matching!
            </Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                skipOnService.disconnect();
                setChatState('idle');
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Chatting State
  return (
    <View style={styles.container}>
      <TopNavigation />
      <View style={styles.header}>
        <View style={styles.statusDot} />
        <Text style={styles.headerText}>
          {partnerName || (partnerId ? `Chatting with ${partnerId.substring(0, 8)}...` : 'Chatting with someone')}
        </Text>
        {roomReady && (
          <TouchableOpacity 
            style={styles.videoCallButton} 
            onPress={handleStartVideoCall}
            disabled={isVideoCallActive}
          >
            <Ionicons name="videocam" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Ionicons name="play-skip-forward" size={18} color="#FFFFFF" />
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>
      
      {/* Video Call View Overlay */}
      {isVideoCallActive && (
        <VideoCallView
          localStream={localStream}
          remoteStream={remoteStream}
          isCallActive={isVideoCallActive}
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          onEndCall={handleEndVideoCall}
          onToggleVideo={handleToggleVideo}
          onToggleAudio={handleToggleAudio}
          partnerName={partnerName || undefined}
        />
      )}

      {/* Incoming Call Dialog */}
      {isIncomingCall && (
        <View style={styles.incomingCallOverlay}>
          <View style={styles.incomingCallDialog}>
            <Text style={styles.incomingCallTitle}>Incoming Video Call</Text>
            <Text style={styles.incomingCallText}>
              {partnerName || 'Someone'} is calling...
            </Text>
            <View style={styles.incomingCallButtons}>
              <TouchableOpacity
                style={[styles.callButton, styles.rejectButton]}
                onPress={() => handleAnswerCall(false)}
              >
                <Ionicons name="call" size={24} color="#FFFFFF" />
                <Text style={styles.callButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callButton, styles.acceptButton]}
                onPress={() => handleAnswerCall(true)}
              >
                <Ionicons name="call" size={24} color="#FFFFFF" />
                <Text style={styles.callButtonText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.message_id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />

        <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
          {!roomReady && (
            <View style={styles.waitingBanner}>
              <Text style={styles.waitingText}>Waiting for partner to join...</Text>
            </View>
          )}
          <TextInput
            style={[styles.input, !roomReady && styles.inputDisabled]}
            placeholder={roomReady ? "Type a message..." : "Waiting for partner..."}
            placeholderTextColor="rgba(255, 255, 255, 0.5)"
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
            maxLength={500}
            editable={roomReady}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!roomReady || !inputMessage.trim()) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!roomReady || !inputMessage.trim()}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  contentContainer: {
    flex: 1,
  },
  startContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  profilePictureContainer: {
    marginBottom: 48,
  },
  profilePicture: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(74, 144, 226, 0.3)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#4A90E2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 12px rgba(74, 144, 226, 0.3)',
      },
    }),
  },
  profilePictureImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  startButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#4A90E2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  searchingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  searchingText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 24,
    marginBottom: 16,
    fontWeight: '500',
  },
  searchingHint: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 32,
    textAlign: 'center',
    paddingHorizontal: 32,
    fontStyle: 'italic',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E91E63',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 6,
  },
  skipButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  videoCallButton: {
    marginRight: 12,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
  },
  incomingCallOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  incomingCallDialog: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
  },
  incomingCallTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  incomingCallText: {
    color: '#CCCCCC',
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  incomingCallButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  callButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#d32f2f',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    maxWidth: '85%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  theirMessageContainer: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  messageAvatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  messageAvatarImage: {
    width: '100%',
    height: '100%',
  },
  messageBubble: {
    maxWidth: '100%',
    padding: 14,
    borderRadius: 20,
  },
  myMessage: {
    backgroundColor: '#4A90E2',
  },
  theirMessage: {
    backgroundColor: '#1A1A1A',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#FFFFFF',
  },
  theirMessageText: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  input: {
    flex: 1,
    backgroundColor: '#252525',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
    maxHeight: 100,
    marginRight: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4A90E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  waitingBanner: {
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  waitingText: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '500',
  },
  inputDisabled: {
    opacity: 0.5,
  },
});
