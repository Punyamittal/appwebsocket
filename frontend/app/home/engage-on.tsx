/**
 * Engage On - Chat + Activities Screen
 * 
 * Combines chat matching with activity selection (Watch/Play/Sing)
 * - Start Chat button similar to Skip On
 * - Once matched: Activity selection in upper half, chat/video in lower half
 * - No code sharing - direct activity access when matched
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
import skipOnService from '../../services/skipOnService.new';
import type { ChatMessageData as SkipOnMessage } from '../../services/skipOnService.new';
import skipOnRESTService from '../../services/skipOnRESTService';
import skipOnVideoCallService from '../../services/skipOnVideoCallService';
import VideoCallView from '../../components/VideoCallView';
import watchApiService from '../../services/watchApiService';
import chessApiService from '../../services/chessApiService';
import singApiService from '../../services/singApiService';
import ChessBoard from '../../components/ChessBoard';

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
type ActivityType = 'watch' | 'play' | 'sing' | null;

const isChatStateActive = (state: ChatState): boolean => {
  return state === 'searching' || state === 'chatting';
};

// Extract YouTube video ID from URL
function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export default function EngageOnScreen() {
  const { user, token } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityType>(null);
  const flatListRef = useRef<FlatList>(null);
  
  // Activity state
  // Watch/Sing state
  const [videoUrl, setVideoUrl] = useState('');
  const [activityRoomId, setActivityRoomId] = useState<string | null>(null);
  const [activityRoomCode, setActivityRoomCode] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Chess state
  const [chessFen, setChessFen] = useState<string>('');
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');
  const [gameState, setGameState] = useState<'idle' | 'waiting' | 'active' | 'finished'>('idle');
  const [chessWinner, setChessWinner] = useState<string | null>(null);
  
  const youtubePlayerRef = useRef<any>(null);
  
  // Activity request state
  const [incomingActivityRequest, setIncomingActivityRequest] = useState<{
    activity: ActivityType;
    requesterId: string;
    requesterName: string;
    requestId: string;
  } | null>(null);
  const [pendingActivityRequest, setPendingActivityRequest] = useState<ActivityType | null>(null);
  
  // Video call state
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  // Get user ID (authenticated or guest)
  const getUserId = async (): Promise<string> => {
    if (user && !user.is_guest && user.id) {
      return user.id;
    }
    return await skipOnRESTService.getGuestId();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[EngageOn] Cleaning up...');
      skipOnService.disconnect();
    };
  }, []);

  /**
   * Start searching for a chat partner
   */
  const handleStartChat = async () => {
    try {
      const userId = await getUserId();
      
      console.log('[EngageOn] Starting chat for user:', userId);
      
      // Initialize video call service
      skipOnVideoCallService.connect(userId);
      skipOnVideoCallService.setCallbacks({
        onIncomingCall: (callerId: string, roomId: string) => {
          console.log('[EngageOn] 📞 Incoming video call from:', callerId);
          setIncomingCallerId(callerId);
          setIsIncomingCall(true);
        },
        onRemoteStream: (stream: MediaStream) => {
          console.log('[EngageOn] 📹 Remote stream received:', stream.id);
          setRemoteStream(stream);
        },
        onCallEnded: () => {
          console.log('[EngageOn] 📴 Video call ended');
          setIsVideoCallActive(false);
          setLocalStream(null);
          setRemoteStream(null);
          setMessages([]);
        },
        onError: (error: string) => {
          console.error('[EngageOn] 📹 Video call error:', error);
          Alert.alert('Video Call Error', error);
        }
      });
      
      setChatState('searching');
      setMessages([]);
      setRoomId(null);
      setInputMessage('');
      setSelectedActivity(null);

      await skipOnService.startChat(
        userId,
        // onMatched
        (foundRoomId: string, foundPartnerId?: string, foundPartnerName?: string) => {
          console.log('[EngageOn] 🎉 Match found! Room:', foundRoomId);
          setMessages([]);
          setRoomReady(false);
          
          if (foundPartnerId) {
            setPartnerId(foundPartnerId);
          }
          if (foundPartnerName) {
            setPartnerName(foundPartnerName);
          } else if (foundPartnerId) {
            setPartnerName(foundPartnerId.substring(0, 8));
          }
          
          setRoomId(foundRoomId);
          setChatState('chatting');
          
          const fallbackTimer = setTimeout(() => {
            setRoomReady((currentReady) => {
              if (!currentReady) {
                console.warn('[EngageOn] ⚠️ Room ready callback not called after 3s, enabling messages anyway');
                return true;
              }
              return currentReady;
            });
          }, 3000);
          (window as any).__engageOnFallbackTimer = fallbackTimer;
        },
        // onMessage
        (message: SkipOnMessage) => {
          console.log('[EngageOn] 📨 Message received:', message.message);
          const chatMessage: ChatMessage = {
            message_id: message.id,
            message: message.message,
            timestamp: message.timestamp,
            is_self: false,
          };
          setMessages((prev) => [...prev, chatMessage]);
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        },
        // onPartnerLeft
        () => {
          console.log('[EngageOn] 🚪 Partner left');
          Alert.alert('Partner Left', 'Your chat partner has left. Starting new search...');
          handleSkip();
        },
        // onError
        (error: string) => {
          console.error('[EngageOn] ❌ Error:', error);
          Alert.alert('Error', error);
          setChatState('error');
        },
        // onRoomReady
        () => {
          console.log('[EngageOn] ✅ Room is ready - both users joined');
          if ((window as any).__engageOnFallbackTimer) {
            clearTimeout((window as any).__engageOnFallbackTimer);
            delete (window as any).__engageOnFallbackTimer;
          }
          setRoomReady(true);
        }
      );

      // Set up activity request/response callbacks
      skipOnService.setActivityRequestCallback((data) => {
        console.log('[EngageOn] 🎮 Incoming activity request:', data.activity);
        setIncomingActivityRequest({
          activity: data.activity as ActivityType,
          requesterId: data.requesterId,
          requesterName: data.requesterName || data.requesterId.substring(0, 8),
          requestId: data.requestId,
        });
      });

      skipOnService.setActivityResponseCallback((data) => {
        console.log('[EngageOn] 🎮 Activity request response:', data.approved ? 'approved' : 'declined');
        if (data.approved && pendingActivityRequest === data.activity) {
          // Request was approved by partner - create room and share with partner
          setPendingActivityRequest(null);
          handleActivityStartAfterApproval(data.activity as ActivityType, true); // true = isRequester
        } else if (!data.approved) {
          // Request was declined
          setPendingActivityRequest(null);
          Alert.alert('Request Declined', `Your partner declined the ${data.activity} activity request.`);
        }
      });

      // Set up activity room created callback - join room when partner creates it
      skipOnService.setActivityRoomCreatedCallback((data) => {
        console.log('[EngageOn] 🎮 Partner created activity room:', data.activityRoomId, 'for activity:', data.activity);
        // Partner created the room, join it
        handleJoinActivityRoom(data.activity as ActivityType, data.activityRoomId);
      });

    } catch (error: any) {
      console.error('[EngageOn] Error starting chat:', error);
      setChatState('error');
      Alert.alert('Error', error.message || 'Failed to start chat. Please try again.');
      skipOnService.disconnect();
    }
  };

  /**
   * Send a message
   */
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !roomId || !roomReady) {
      return;
    }

    const messageText = inputMessage.trim();
    setInputMessage('');

    const optimisticMessage: ChatMessage = {
      message_id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: messageText,
      timestamp: new Date().toISOString(),
      is_self: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      await skipOnService.sendMessage(messageText);
      console.log('[EngageOn] ✅ Message sent');
    } catch (error: any) {
      console.error('[EngageOn] ❌ Error sending message:', error);
      Alert.alert('Error', error.message || 'Failed to send message');
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
        console.log('[EngageOn] ✅ Chat skipped');
      } catch (error) {
        console.error('[EngageOn] Error skipping:', error);
      }
    }

    setRoomId(null);
    setMessages([]);
    setInputMessage('');
    setChatState('idle');
    setIsVideoCallActive(false);
    setSelectedActivity(null);
    skipOnVideoCallService.disconnect();
  };

  /**
   * Handle activity selection - now sends request to partner instead of creating room immediately
   */
  const handleActivitySelect = async (activity: ActivityType) => {
    if (!roomId || !roomReady) {
      Alert.alert('Error', 'Please wait for match to complete');
      return;
    }

    try {
      // Send activity request to partner
      setPendingActivityRequest(activity);
      const userId = await getUserId();
      await skipOnService.sendActivityRequest(activity, user?.name || partnerName || undefined);
      Alert.alert(
        'Request Sent',
        `Waiting for ${partnerName || 'partner'} to approve the ${activity} activity request...`
      );
    } catch (error: any) {
      console.error('[EngageOn] Error sending activity request:', error);
      Alert.alert('Error', error.message || 'Failed to send activity request');
      setPendingActivityRequest(null);
    }
  };

  /**
   * Handle activity start after approval - creates activity room (if requester) or waits for partner's room
   */
  const handleActivityStartAfterApproval = async (activity: ActivityType, isRequester: boolean = false) => {
    const userId = await getUserId();

    try {
      if (activity === 'play') {
        if (isRequester) {
          // Requester: Create chess game and share roomId with partner
          console.log('[EngageOn] Creating chess game after approval (as requester)...');
          const result = await chessApiService.createRoom(userId);
          if (result.success && result.roomId) {
            setSelectedActivity(activity);
            setActivityRoomId(result.roomId);
            setChessFen(result.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            setPlayerColor('white');
            setCurrentTurn(result.turn === 'black' ? 'black' : 'white');
            setGameState(result.status === 'active' ? 'active' : 'waiting');
            
            // Share roomId with partner via socket (no room codes - direct roomId sharing)
            if (roomId && skipOnService) {
              try {
                await skipOnService.shareActivityRoom(activity, result.roomId);
                console.log('[EngageOn] ✅ Shared activity room ID with partner:', result.roomId);
              } catch (error) {
                console.error('[EngageOn] Error sharing activity room ID:', error);
              }
            }
            
            // Start polling
            chessApiService.startPolling(result.roomId, (data) => {
              if (data.fen) setChessFen(data.fen);
              if (data.turn) setCurrentTurn(data.turn);
              if (data.status) {
                setGameState(data.status === 'active' ? 'active' : data.status === 'finished' ? 'finished' : 'waiting');
              }
              if (data.winner) setChessWinner(data.winner);
              if (data.blackPlayer && !playerColor) {
                setPlayerColor('white');
              }
            }, 2000);
          } else {
            throw new Error(result.error || 'Failed to create chess game');
          }
        }
        // If not requester, wait for partner to create room and share roomId
      } else if (activity === 'watch' || activity === 'sing') {
        // Watch/Sing: Show input for video URL (requester) or wait for partner
        if (isRequester) {
          setSelectedActivity(activity);
        }
        // If not requester, wait for partner to create room
      }
    } catch (error: any) {
      console.error('[EngageOn] Error starting activity after approval:', error);
      Alert.alert('Error', error.message || 'Failed to start activity');
      setSelectedActivity(null);
    }
  };

  /**
   * Join activity room when partner creates it
   */
  const handleJoinActivityRoom = async (activity: ActivityType, activityRoomId: string) => {
    const userId = await getUserId();

    try {
      if (activity === 'play') {
        // Join chess room
        console.log('[EngageOn] Joining chess room created by partner:', activityRoomId);
        const result = await chessApiService.joinRoom(userId, activityRoomId);
        if (result.success) {
          setSelectedActivity(activity);
          setActivityRoomId(activityRoomId);
          setChessFen(result.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
          setPlayerColor('black'); // Second player is black
          setCurrentTurn(result.turn === 'black' ? 'black' : 'white');
          setGameState(result.status === 'active' ? 'active' : 'waiting');
          
          // Start polling
          chessApiService.startPolling(activityRoomId, (data) => {
            if (data.fen) setChessFen(data.fen);
            if (data.turn) setCurrentTurn(data.turn);
            if (data.status) {
              setGameState(data.status === 'active' ? 'active' : data.status === 'finished' ? 'finished' : 'waiting');
            }
            if (data.winner) setChessWinner(data.winner);
          }, 2000);
        } else {
          throw new Error(result.error || 'Failed to join chess game');
        }
      } else if (activity === 'watch' || activity === 'sing') {
        // For watch/sing, partner will share roomId after creating
        setSelectedActivity(activity);
        setActivityRoomId(activityRoomId);
        // Start polling
        const service = activity === 'watch' ? watchApiService : singApiService;
        service.startPolling(activityRoomId, (data) => {
          if (data.videoId) setVideoId(data.videoId);
          if (data.videoUrl) setVideoUrl(data.videoUrl);
          if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
          if (data.currentTime !== undefined) setCurrentTime(data.currentTime);
        }, 2000);
      }
    } catch (error: any) {
      console.error('[EngageOn] Error joining activity room:', error);
      Alert.alert('Error', error.message || 'Failed to join activity');
    }
  };

  /**
   * Handle activity request approval - just send approval, wait for requester to create room
   */
  const handleApproveActivityRequest = async () => {
    if (!incomingActivityRequest) return;

    const { activity, requestId } = incomingActivityRequest;
    
    try {
      // Send approval response - requester will create room and share roomId
      await skipOnService.respondToActivityRequest(requestId, activity, true);
      
      // Clear incoming request - room will be joined when partner shares roomId
      setIncomingActivityRequest(null);
      
      // Don't create room here - wait for requester to create and share roomId
      // The activity will start when we receive roomId via skipon_activity_room_created
      Alert.alert('Request Approved', `Waiting for ${partnerName || 'partner'} to start the ${activity} activity...`);
    } catch (error: any) {
      console.error('[EngageOn] Error approving activity request:', error);
      Alert.alert('Error', error.message || 'Failed to approve request');
    }
  };

  /**
   * Handle activity request decline
   */
  const handleDeclineActivityRequest = async () => {
    if (!incomingActivityRequest) return;

    const { activity, requestId } = incomingActivityRequest;
    
    try {
      // Send decline response
      await skipOnService.respondToActivityRequest(requestId, activity, false);
      
      // Clear incoming request
      setIncomingActivityRequest(null);
    } catch (error: any) {
      console.error('[EngageOn] Error declining activity request:', error);
      Alert.alert('Error', error.message || 'Failed to decline request');
    }
  };

  /**
   * Initialize Watch/Sing activity with video URL
   */
  const handleStartWatchSing = async () => {
    if (!videoUrl.trim() || !user || !token || !selectedActivity) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    const extractedId = extractYouTubeId(videoUrl);
    if (!extractedId) {
      Alert.alert('Error', 'Invalid YouTube URL');
      return;
    }

    const userId = await getUserId();
    const service = selectedActivity === 'watch' ? watchApiService : singApiService;

    try {
      console.log(`[EngageOn] Creating ${selectedActivity} room...`);
      const result = await service.createRoom(userId, extractedId, videoUrl.trim());
      
      if (result.success && result.roomId) {
        setActivityRoomId(result.roomId);
        setActivityRoomCode(result.roomCode || null);
        setVideoId(result.videoId || extractedId);
        setIsHost(true);
        setIsPlaying(result.isPlaying || false);
        setCurrentTime(result.currentTime || 0);
        
        // Start polling
        service.startPolling(result.roomId, (data) => {
          if (data.videoId) setVideoId(data.videoId);
          if (data.videoUrl) setVideoUrl(data.videoUrl);
          if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
          if (data.currentTime !== undefined) setCurrentTime(data.currentTime);
        }, 2000);
      } else {
        throw new Error(result.error || `Failed to create ${selectedActivity} room`);
      }
    } catch (error: any) {
      console.error(`[EngageOn] Error creating ${selectedActivity} room:`, error);
      Alert.alert('Error', error.message || `Failed to start ${selectedActivity}`);
    }
  };

  /**
   * Make chess move
   */
  const handleChessMove = async (from: string, to: string, promotion?: string) => {
    if (!activityRoomId || !user) return;
    
    const userId = await getUserId();
    const result = await chessApiService.makeMove(activityRoomId, userId, from, to, promotion);
    
    if (result.success) {
      if (result.fen) setChessFen(result.fen);
      if (result.turn) setCurrentTurn(result.turn);
      if (result.status) {
        setGameState(result.status === 'active' ? 'active' : 'finished');
      }
      if (result.winner) setChessWinner(result.winner);
    } else {
      Alert.alert('Error', result.error || 'Invalid move');
    }
  };

  /**
   * Start video call
   */
  const handleStartVideoCall = async () => {
    if (!roomId || !partnerId) {
      Alert.alert('Error', 'Cannot start video call');
      return;
    }

    try {
      const userId = await getUserId();
      await skipOnVideoCallService.initiateCall(roomId, userId, partnerId);
      const localStream = skipOnVideoCallService.getLocalStream();
      setLocalStream(localStream);
      setIsVideoCallActive(true);
    } catch (error: any) {
      console.error('[EngageOn] Error starting video call:', error);
      if (error.message && error.message.includes('permission denied')) {
        Alert.alert('Camera Permission Required', 'Please allow camera access in your browser settings.');
      } else {
        Alert.alert('Error', error.message || 'Failed to start video call');
      }
    }
  };

  /**
   * Answer incoming call
   */
  const handleAnswerCall = async (accepted: boolean) => {
    if (!roomId || !incomingCallerId) return;

    try {
      const userId = await getUserId();
      await skipOnVideoCallService.answerCall(roomId, userId, accepted);
      
      if (accepted) {
        const localStream = skipOnVideoCallService.getLocalStream();
        setLocalStream(localStream);
        setIsVideoCallActive(true);
      }
      
      setIsIncomingCall(false);
      setIncomingCallerId(null);
    } catch (error: any) {
      console.error('[EngageOn] Error answering call:', error);
      Alert.alert('Error', error.message || 'Failed to answer video call');
      setIsIncomingCall(false);
      setIncomingCallerId(null);
    }
  };

  /**
   * End video call
   */
  const handleEndVideoCall = async () => {
    if (roomId) {
      const userId = await getUserId();
      skipOnVideoCallService.endCall(roomId, userId);
    }
    setIsVideoCallActive(false);
    setLocalStream(null);
    setRemoteStream(null);
    setMessages([]);
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
              source={getAvatarImage('i1')}
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

  // Activity selection cards data
  const activities = [
    {
      id: 'watch' as ActivityType,
      title: 'Watch Along',
      description: 'Watch YouTube videos together',
      icon: 'play-circle',
      color: '#FFB020',
      badgeColor: 'rgba(255, 176, 32, 0.15)',
    },
    {
      id: 'play' as ActivityType,
      title: 'Play Along',
      description: 'Play chess together',
      icon: 'game-controller',
      color: '#7C3AED',
      badgeColor: 'rgba(124, 58, 237, 0.15)',
    },
    {
      id: 'sing' as ActivityType,
      title: 'Sing Along',
      description: 'Karaoke together',
      icon: 'musical-notes',
      color: '#10B981',
      badgeColor: 'rgba(16, 185, 129, 0.15)',
    },
  ];

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
              disabled={isChatStateActive(chatState)}
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
            <ActivityIndicator size="large" color="#E91E63" />
            <Text style={styles.searchingText}>Connecting...</Text>
            <Text style={styles.searchingText}>Finding someone to chat with</Text>
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

  // Chatting State - Split view: Activities (upper) + Chat/Video (lower)
  return (
    <View style={styles.container}>
      {!isVideoCallActive && <TopNavigation />}
      
      {/* Header - Show when not in video call, or show minimal header during video call */}
      {!isVideoCallActive ? (
        <View style={styles.header}>
          <View style={styles.statusDot} />
          <Text style={styles.headerText}>
            {partnerName || (partnerId ? `Chatting with ${partnerId.substring(0, 8)}...` : 'Chatting')}
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
      ) : (
        <View style={styles.minimalHeader}>
          <Text style={styles.headerText}>
            {partnerName || (partnerId ? `Chatting with ${partnerId.substring(0, 8)}...` : 'Chatting')}
          </Text>
        </View>
      )}

      {/* Upper Half: Activity Selection - Always show during chat, including video call */}
      <View style={[styles.upperHalf, isVideoCallActive && styles.upperHalfWithVideo]}>
            {selectedActivity === 'play' && activityRoomId ? (
              // Chess Game
              <View style={styles.chessContainer}>
                {chessFen && playerColor && gameState === 'active' ? (
                  <View style={styles.chessBoardWrapper}>
                    <ChessBoard
                      fen={chessFen}
                      playerColor={playerColor}
                      currentTurn={currentTurn}
                      onMove={handleChessMove}
                      disabled={gameState !== 'active' || currentTurn !== playerColor}
                    />
                  </View>
                ) : gameState === 'waiting' ? (
                  <View style={styles.waitingContainer}>
                    <ActivityIndicator size="small" color="#7C3AED" />
                    <Text style={styles.waitingText}>Waiting for opponent...</Text>
                  </View>
                ) : (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading game...</Text>
                  </View>
                )}
                {gameState === 'active' && (
                  <View style={styles.chessInfo}>
                    <Text style={styles.turnText}>
                      {currentTurn === playerColor ? 'Your Turn' : "Opponent's Turn"}
                    </Text>
                  </View>
                )}
                <TouchableOpacity style={styles.backButton} onPress={() => {
                  setSelectedActivity(null);
                  setActivityRoomId(null);
                  chessApiService.stopPolling();
                }}>
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              </View>
            ) : selectedActivity === 'watch' || selectedActivity === 'sing' ? (
              // Watch/Sing - Video URL input or player
              <View style={styles.videoContainer}>
                {!activityRoomId ? (
                  // Input phase
                  <View style={styles.videoInputContainer}>
                    <Text style={styles.videoInputTitle}>
                      {selectedActivity === 'watch' ? 'Watch Together' : 'Sing Together'}
                    </Text>
                    <Text style={styles.videoInputSubtitle}>Paste a YouTube URL</Text>
                    <TextInput
                      style={styles.videoInput}
                      placeholder="https://www.youtube.com/watch?v=..."
                      placeholderTextColor="rgba(255, 255, 255, 0.4)"
                      value={videoUrl}
                      onChangeText={setVideoUrl}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.startVideoButton}
                      onPress={handleStartWatchSing}
                      disabled={!videoUrl.trim()}
                    >
                      <Text style={styles.startVideoButtonText}>Start</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.backButton} onPress={() => setSelectedActivity(null)}>
                      <Text style={styles.backButtonText}>Back</Text>
                    </TouchableOpacity>
                  </View>
                ) : videoId ? (
                  // Player phase
                  <View style={styles.videoPlayerContainer}>
                    {Platform.OS === 'web' ? (
                      <div
                        id="youtube-player-embed"
                        style={{
                          width: '100%',
                          height: '100%',
                          backgroundColor: '#000',
                        }}
                      />
                    ) : (
                      <View style={styles.videoPlaceholder}>
                        <Ionicons name="play-circle" size={48} color="#FFB020" />
                        <Text style={styles.videoPlaceholderText}>Video Player</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.backButton} onPress={() => {
                      setSelectedActivity(null);
                      setActivityRoomId(null);
                      watchApiService.stopPolling();
                      singApiService.stopPolling();
                    }}>
                      <Text style={styles.backButtonText}>Back</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#FFB020" />
                    <Text style={styles.loadingText}>Loading...</Text>
                  </View>
                )}
              </View>
            ) : selectedActivity ? (
              // Fallback
              <View style={styles.activityContainer}>
                <Text style={styles.activityTitle}>
                  {activities.find(a => a.id === selectedActivity)?.title}
                </Text>
                <Text style={styles.activityPlaceholder}>Loading activity...</Text>
                <TouchableOpacity style={styles.backButton} onPress={() => setSelectedActivity(null)}>
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.activitiesContainer}>
                <Text style={styles.activitiesTitle}>Choose an Activity</Text>
                <View style={styles.activityCards}>
                  {activities.map((activity) => (
                    <TouchableOpacity
                      key={activity.id}
                      style={styles.activityCard}
                      onPress={() => handleActivitySelect(activity.id)}
                    >
                      <View style={[styles.activityIconContainer, { backgroundColor: activity.badgeColor }]}>
                        <Ionicons
                          name={activity.icon as any}
                          size={32}
                          color={activity.color}
                        />
                      </View>
                      <View style={styles.activityCardContent}>
                        <Text style={styles.activityCardTitle}>{activity.title}</Text>
                        <Text style={styles.activityCardDescription}>{activity.description}</Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="rgba(255, 255, 255, 0.3)"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Lower Half: Chat or Video Call */}
          {!isVideoCallActive ? (
            <View style={styles.lowerHalf}>
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
          ) : (
            <View style={styles.lowerHalf}>
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
                messages={messages}
                inputMessage={inputMessage}
                onInputChange={setInputMessage}
                onSendMessage={handleSendMessage}
                roomReady={roomReady}
              />
            </View>
          )}

      {/* Video Call View - Now shown in lower half above, removed full-screen overlay */}

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

      {/* Incoming Activity Request Dialog */}
      {incomingActivityRequest && (
        <View style={styles.incomingCallOverlay}>
          <View style={styles.incomingCallDialog}>
            <Text style={styles.incomingCallTitle}>Activity Request</Text>
            <Text style={styles.incomingCallText}>
              {incomingActivityRequest.requesterName} wants to start{' '}
              {incomingActivityRequest.activity === 'play' && 'Play Along'}
              {incomingActivityRequest.activity === 'watch' && 'Watch Along'}
              {incomingActivityRequest.activity === 'sing' && 'Sing Along'}
            </Text>
            <View style={styles.incomingCallButtons}>
              <TouchableOpacity
                style={[styles.callButton, styles.rejectButton]}
                onPress={handleDeclineActivityRequest}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
                <Text style={styles.callButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callButton, styles.acceptButton]}
                onPress={handleApproveActivityRequest}
              >
                <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                <Text style={styles.callButtonText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Pending Activity Request Indicator */}
      {pendingActivityRequest && (
        <View style={styles.pendingRequestBanner}>
          <Text style={styles.pendingRequestText}>
            Waiting for {partnerName || 'partner'} to approve {pendingActivityRequest} request...
          </Text>
        </View>
      )}
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
    backgroundColor: 'rgba(233, 30, 99, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(233, 30, 99, 0.3)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#E91E63',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      web: {
        boxShadow: '0 4px 12px rgba(233, 30, 99, 0.3)',
      },
    }),
  },
  profilePictureImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  startButton: {
    backgroundColor: '#E91E63',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#E91E63',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
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
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 32,
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
    backgroundColor: 'rgba(233, 30, 99, 0.2)',
  },
  minimalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 20,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  // Upper Half: Activities
  upperHalf: {
    height: '50%',
    backgroundColor: '#0F0F0F',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  upperHalfWithVideo: {
    height: '50%',
  },
  activitiesContainer: {
    flex: 1,
    padding: 16,
  },
  activitiesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  activityCards: {
    gap: 12,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  activityIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityCardContent: {
    flex: 1,
  },
  activityCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  activityCardDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  activityContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  activityTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  activityPlaceholder: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 24,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  // Lower Half: Chat
  lowerHalf: {
    height: '50%',
    backgroundColor: '#0F0F0F',
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
    backgroundColor: '#E91E63',
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
    backgroundColor: '#E91E63',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  waitingBanner: {
    backgroundColor: 'rgba(233, 30, 99, 0.2)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  waitingText: {
    color: '#E91E63',
    fontSize: 12,
    fontWeight: '500',
  },
  inputDisabled: {
    opacity: 0.5,
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
  // Activity component styles
  chessContainer: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chessBoardWrapper: {
    width: '100%',
    maxWidth: 300,
    aspectRatio: 1,
    marginBottom: 12,
  },
  chessInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  turnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  videoContainer: {
    flex: 1,
    padding: 16,
  },
  videoInputContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  videoInputTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  videoInputSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 20,
  },
  videoInput: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  startVideoButton: {
    backgroundColor: '#FFB020',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
  },
  startVideoButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  videoPlayerContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  videoPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 12,
  },
  roomCodeText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginTop: 12,
  },
  pendingRequestBanner: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 176, 32, 0.2)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 176, 32, 0.3)',
    zIndex: 999,
  },
  pendingRequestText: {
    color: '#FFB020',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
