/**
 * Watch Along Screen
 * 
 * Features:
 * - Create/Join watch rooms
 * - YouTube video sync (play/pause/seek/video change)
 * - Host controls playback for all viewers
 * - Real-time sync via REST API + polling
 */

// TypeScript declarations for YouTube IFrame API (web)
declare global {
  interface Window {
    YT?: {
      Player: any;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import engageService from '../../services/engageService';
import watchApiService from '../../services/watchApiService';
import watchAlongFirebaseService, { ChatMessage } from '../../services/watchAlongFirebaseService';

// Extract YouTube video ID from URL
function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

type RoomState = 'idle' | 'creating' | 'joining' | 'watching' | 'error';

export default function WatchAlongScreen() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const [videoUrl, setVideoUrl] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState>('idle');
  const [isHost, setIsHost] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [messages, setMessages] = useState<Array<{ id: string; senderId: string; text: string; timestamp: number; senderName?: string; isSelf: boolean }>>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [showChat, setShowChat] = useState(true);
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const flatListRef = useRef<any>(null);

  // Auth check - redirect immediately if not authenticated
  if (!user || user.is_guest || !token) {
    return <Redirect href="/welcome" />;
  }

  // Initialize Firebase chat when room is created/joined
  useEffect(() => {
    if (roomId && roomState === 'watching') {
      console.log('[WatchAlong] Initializing Firebase chat for room:', roomId);
      watchAlongFirebaseService.initializeRoom(roomId).then(() => {
        // Subscribe to messages
        watchAlongFirebaseService.subscribeToMessages((message: ChatMessage) => {
          const isSelf = message.senderId === user?.id;
          setMessages((prev) => [...prev, {
            id: message.id,
            senderId: message.senderId,
            text: message.text,
            timestamp: message.timestamp,
            senderName: message.senderName,
            isSelf,
          }]);
          
          // Auto-scroll to bottom
          setTimeout(() => {
            if (flatListRef.current) {
              flatListRef.current.scrollToEnd({ animated: true });
            }
          }, 100);
        });
      }).catch((error) => {
        console.error('[WatchAlong] Error initializing Firebase chat:', error);
      });
    }

    return () => {
      watchAlongFirebaseService.cleanup();
    };
  }, [roomId, roomState, user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        engageService.disconnectWatchAlong();
      }
      // Stop polling when component unmounts
      watchApiService.stopPolling();
      // Cleanup Firebase
      watchAlongFirebaseService.cleanup();
    };
  }, []);

  // Initialize YouTube IFrame API for web
  useEffect(() => {
    if (Platform.OS === 'web' && videoId && typeof window !== 'undefined') {
      // Load YouTube IFrame API if not already loaded
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      // Initialize player when API is ready
      const initPlayer = () => {
        const container = document.getElementById('youtube-player-iframe');
        if (window.YT && window.YT.Player && container) {
          // Destroy existing player if any
          if (youtubePlayerRef.current) {
            try {
              youtubePlayerRef.current.destroy();
            } catch (e) {
              // Ignore errors
            }
          }

          console.log('[WatchAlong] Initializing YouTube player with videoId:', videoId);
          youtubePlayerRef.current = new window.YT.Player('youtube-player-iframe', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
              playsinline: 1,
              controls: isHost ? 1 : 0,
              modestbranding: 1,
              enablejsapi: 1,
            },
            events: {
              onReady: (event: any) => {
                console.log('[WatchAlong] YouTube player ready');
                event.target.seekTo(currentTime, true);
                if (isPlaying) {
                  event.target.playVideo();
                } else {
                  event.target.pauseVideo();
                }
              },
              onStateChange: (event: any) => {
                // Only update state if user is host (to avoid feedback loop)
                if (isHost) {
                  if (event.data === window.YT!.PlayerState.PLAYING) {
                    setIsPlaying(true);
                  } else if (event.data === window.YT!.PlayerState.PAUSED) {
                    setIsPlaying(false);
                  }
                }
              },
              onError: (event: any) => {
                console.error('[WatchAlong] YouTube player error:', event.data);
              },
            },
          });
        } else {
          console.warn('[WatchAlong] Cannot initialize player - YT:', !!window.YT, 'Container:', !!container);
        }
      };

      if (window.YT && window.YT.Player) {
        initPlayer();
      } else {
        window.onYouTubeIframeAPIReady = initPlayer;
      }

      return () => {
        if (youtubePlayerRef.current) {
          try {
            youtubePlayerRef.current.destroy();
          } catch (e) {
            // Ignore errors
          }
          youtubePlayerRef.current = null;
        }
      };
    }
  }, [videoId, isHost]); // Only re-init when videoId or host status changes

  // Sync video player when state changes (web)
  useEffect(() => {
    if (Platform.OS === 'web' && youtubePlayerRef.current && videoId) {
      try {
        // Only sync if player is ready
        const playerState = youtubePlayerRef.current.getPlayerState();
        if (playerState !== window.YT?.PlayerState.UNSTARTED) {
          // Sync time
          const currentPlayerTime = youtubePlayerRef.current.getCurrentTime();
          const timeDiff = Math.abs(currentPlayerTime - currentTime);
          
          // Only seek if difference is significant (more than 1 second)
          if (timeDiff > 1) {
            youtubePlayerRef.current.seekTo(currentTime, true);
          }
          
          // Sync play/pause state
          if (isPlaying && playerState !== window.YT?.PlayerState.PLAYING) {
            youtubePlayerRef.current.playVideo();
          } else if (!isPlaying && playerState === window.YT?.PlayerState.PLAYING) {
            youtubePlayerRef.current.pauseVideo();
          }
        }
      } catch (e) {
        console.warn('[WatchAlong] Error syncing YouTube player:', e);
      }
    }
  }, [currentTime, isPlaying, videoId]);

  const handleCreateRoom = async () => {
    if (!videoUrl.trim()) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    const extractedId = extractYouTubeId(videoUrl);
    if (!extractedId) {
      Alert.alert('Error', 'Invalid YouTube URL');
      return;
    }

    if (!token || !user) {
      Alert.alert('Error', 'Authentication required');
      return;
    }

    setRoomState('creating');

    try {
      console.log('[WatchAlong] Creating room via REST API...');
      const result = await watchApiService.createRoom(user.id, extractedId, videoUrl.trim());
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create room');
      }

      if (!result.roomId) {
        throw new Error('Invalid response from server');
      }

      console.log(`[WatchAlong] ✅ Room created: ${result.roomId} (Code: ${result.roomCode})`);
      
      // Update state
      setRoomId(result.roomId);
      setRoomCode(result.roomCode);
      setVideoId(result.videoId || extractedId);
      setIsHost(true);
      setIsPlaying(result.isPlaying || false);
      setCurrentTime(result.currentTime || 0);
      setRoomState('watching');
      
      // Start polling for updates
      watchApiService.startPolling(result.roomId, (data) => {
        console.log('[WatchAlong] Room update:', data);
        if (data.videoId) setVideoId(data.videoId);
        if (data.videoUrl) setVideoUrl(data.videoUrl);
        if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
        if (data.currentTime !== undefined) {
          setCurrentTime(data.currentTime);
        }
        
        // Sync video player
        if (Platform.OS === 'web' && youtubePlayerRef.current && !isHost) {
          // Web: Use YouTube IFrame API
          try {
            const playerState = youtubePlayerRef.current.getPlayerState();
            if (playerState !== window.YT?.PlayerState.UNSTARTED) {
              const currentPlayerTime = youtubePlayerRef.current.getCurrentTime();
              const timeDiff = Math.abs(currentPlayerTime - (data.currentTime || 0));
              
              // Only seek if difference is significant (more than 1 second)
              if (timeDiff > 1 && data.currentTime !== undefined) {
                youtubePlayerRef.current.seekTo(data.currentTime, true);
              }
              
              // Sync play/pause state
              if (data.isPlaying && playerState !== window.YT?.PlayerState.PLAYING) {
                youtubePlayerRef.current.playVideo();
              } else if (!data.isPlaying && playerState === window.YT?.PlayerState.PLAYING) {
                youtubePlayerRef.current.pauseVideo();
              }
            }
          } catch (e) {
            console.warn('[WatchAlong] Error syncing YouTube player:', e);
          }
        } else if (Platform.OS !== 'web' && webViewRef.current && !isHost) {
          // Native: Use WebView injectJavaScript
          webViewRef.current.injectJavaScript(`
            if (player) {
              player.seekTo(${data.currentTime || 0}, true);
              ${data.isPlaying ? 'player.playVideo();' : 'player.pauseVideo();'}
            }
          `);
        }
      }, 2000); // Poll every 2 seconds
      
    } catch (error: any) {
      console.error('[WatchAlong] Create room error:', error);
      Alert.alert(
        'Connection Error', 
        error.message || 'Failed to create room. Make sure:\n\n1. Engage server is running (port 3002)\n2. Redis is running\n3. Check your network connection'
      );
      setRoomState('error');
    }
  };

  const handleJoinRoom = async () => {
    const codeToJoin = roomCode?.trim() || '';
    
    if (!codeToJoin || codeToJoin.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit room code');
      return;
    }

    if (!token || !user) {
      Alert.alert('Error', 'Authentication required');
      return;
    }

    setRoomState('joining');

    try {
      console.log(`[WatchAlong] Joining room with code: ${codeToJoin}`);
      const result = await watchApiService.joinRoom(user.id, codeToJoin);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to join room');
      }

      if (!result.roomId) {
        throw new Error('Invalid response from server');
      }

      console.log(`[WatchAlong] ✅ Joined room: ${result.roomId}`);
      
      // Update state
      setRoomId(result.roomId);
      setRoomCode(result.roomCode || codeToJoin);
      setVideoId(result.videoId);
      setVideoUrl(result.videoUrl || '');
      setIsHost(result.isHost || false);
      setIsPlaying(result.isPlaying || false);
      setCurrentTime(result.currentTime || 0);
      setRoomState('watching');
      
      // Start polling for updates
      watchApiService.startPolling(result.roomId, (data) => {
        console.log('[WatchAlong] Room update:', data);
        if (data.videoId) setVideoId(data.videoId);
        if (data.videoUrl) setVideoUrl(data.videoUrl);
        if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
        if (data.currentTime !== undefined) {
          setCurrentTime(data.currentTime);
        }
        
        // Sync video player
        if (Platform.OS === 'web' && youtubePlayerRef.current && !isHost) {
          // Web: Use YouTube IFrame API
          try {
            const playerState = youtubePlayerRef.current.getPlayerState();
            if (playerState !== window.YT?.PlayerState.UNSTARTED) {
              const currentPlayerTime = youtubePlayerRef.current.getCurrentTime();
              const timeDiff = Math.abs(currentPlayerTime - (data.currentTime || 0));
              
              // Only seek if difference is significant (more than 1 second)
              if (timeDiff > 1 && data.currentTime !== undefined) {
                youtubePlayerRef.current.seekTo(data.currentTime, true);
              }
              
              // Sync play/pause state
              if (data.isPlaying && playerState !== window.YT?.PlayerState.PLAYING) {
                youtubePlayerRef.current.playVideo();
              } else if (!data.isPlaying && playerState === window.YT?.PlayerState.PLAYING) {
                youtubePlayerRef.current.pauseVideo();
              }
            }
          } catch (e) {
            console.warn('[WatchAlong] Error syncing YouTube player:', e);
          }
        } else if (Platform.OS !== 'web' && webViewRef.current && !isHost) {
          // Native: Use WebView injectJavaScript
          webViewRef.current.injectJavaScript(`
            if (player) {
              player.seekTo(${data.currentTime || 0}, true);
              ${data.isPlaying ? 'player.playVideo();' : 'player.pauseVideo();'}
            }
          `);
        }
      }, 2000); // Poll every 2 seconds
      
    } catch (error: any) {
      console.error('[WatchAlong] Join room error:', error);
      Alert.alert('Error', error.message || 'Failed to join room');
      setRoomState('error');
    }
  };

  // Host controls
  const handlePlay = () => {
    if (!isHost || !socketRef.current || !roomId) return;
    socketRef.current.emit('play', { roomId, currentTime });
  };

  const handlePause = () => {
    if (!isHost || !socketRef.current || !roomId) return;
    socketRef.current.emit('pause', { roomId, currentTime });
  };

  const handleSeek = (time: number) => {
    if (!isHost || !socketRef.current || !roomId) return;
    socketRef.current.emit('seek', { roomId, currentTime: time });
  };

  const handleChangeVideo = (newUrl: string) => {
    if (!isHost || !socketRef.current || !roomId) return;
    const newId = extractYouTubeId(newUrl);
    if (newId) {
      socketRef.current.emit('change_video', {
        roomId,
        videoId: newId,
        videoUrl: newUrl,
      });
    }
  };

  // YouTube iframe HTML
  const getYouTubeHTML = (vidId: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; background: #000; }
          #player { width: 100%; height: 100vh; }
        </style>
      </head>
      <body>
        <div id="player"></div>
        <script src="https://www.youtube.com/iframe_api"></script>
        <script>
          var player;
          function onYouTubeIframeAPIReady() {
            player = new YT.Player('player', {
              height: '100%',
              width: '100%',
              videoId: '${vidId}',
              playerVars: {
                'playsinline': 1,
                'controls': ${isHost ? 1 : 0},
                'modestbranding': 1,
              },
              events: {
                'onReady': function(event) {
                  event.target.seekTo(${currentTime}, true);
                  ${isPlaying ? 'event.target.playVideo();' : 'event.target.pauseVideo();'}
                },
                'onStateChange': function(event) {
                  if (event.data === YT.PlayerState.PLAYING) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'playing' }));
                  } else if (event.data === YT.PlayerState.PAUSED) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'paused' }));
                  }
                },
                'onError': function(event) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', data: event.data }));
                }
              }
            });
          }
        </script>
      </body>
    </html>
  `;

  if (roomState === 'watching' && videoId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Watch Along</Text>
            {roomCode && (
              <Text style={styles.roomCode}>Room: {roomCode.toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            {isHost && (
              <View style={styles.hostBadge}>
                <Text style={styles.hostBadgeText}>HOST</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.playerContainer}>
          {Platform.OS === 'web' ? (
            // Web: Use div container - YouTube IFrame API will create the iframe
            <div 
              id="youtube-player-iframe" 
              style={{ 
                width: '100%', 
                height: '100%',
                backgroundColor: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
          ) : (
            // Native: Use WebView (conditionally imported)
            (() => {
              try {
                const { WebView } = require('react-native-webview');
                return (
                  <WebView
                    ref={webViewRef}
                    source={{ html: getYouTubeHTML(videoId) }}
                    style={styles.webview}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    onMessage={(event: any) => {
                      const data = JSON.parse(event.nativeEvent.data);
                      if (data.type === 'playing') {
                        setIsPlaying(true);
                      } else if (data.type === 'paused') {
                        setIsPlaying(false);
                      }
                    }}
                  />
                );
              } catch (e) {
                return (
                  <View style={styles.webview}>
                    <Text style={{ color: '#fff', textAlign: 'center', padding: 20 }}>
                      WebView not available on this platform
                    </Text>
                  </View>
                );
              }
            })()
          )}
        </View>

        {isHost && (
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, !isPlaying && styles.controlButtonActive]}
              onPress={handlePause}
            >
              <Ionicons name="pause" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, isPlaying && styles.controlButtonActive]}
              onPress={handlePlay}
            >
              <Ionicons name="play" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {!isHost && (
          <View style={styles.viewerBadge}>
            <Text style={styles.viewerText}>Viewer - Waiting for host to control playback</Text>
          </View>
        )}

        {/* Chat Section */}
        {showChat && (
          <View style={styles.chatSection}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatHeaderText}>Chat</Text>
              <TouchableOpacity onPress={() => setShowChat(false)}>
                <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.chatMessagesContainer}>
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                style={styles.chatMessagesList}
                contentContainerStyle={styles.chatMessagesContent}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.chatMessage,
                      item.isSelf ? styles.chatMessageSelf : styles.chatMessageOther,
                    ]}
                  >
                    {!item.isSelf && item.senderName && (
                      <Text style={styles.chatMessageSender}>{item.senderName}</Text>
                    )}
                    <Text style={styles.chatMessageText}>{item.text}</Text>
                  </View>
                )}
              />
            </View>

            <View style={styles.chatInputContainer}>
              <TextInput
                style={styles.chatInput}
                placeholder="Type a message..."
                placeholderTextColor="#999"
                value={inputMessage}
                onChangeText={setInputMessage}
                multiline={false}
              />
              <TouchableOpacity
                style={[styles.chatSendButton, !inputMessage.trim() && styles.chatSendButtonDisabled]}
                onPress={async () => {
                  if (!inputMessage.trim() || !roomId || !user) return;
                  
                  const messageText = inputMessage.trim();
                  setInputMessage('');
                  
                  // Optimistically add message
                  const optimisticMessage = {
                    id: `temp_${Date.now()}`,
                    senderId: user.id,
                    text: messageText,
                    timestamp: Date.now(),
                    senderName: user.name || `User ${user.id.substring(0, 8)}`,
                    isSelf: true,
                  };
                  setMessages((prev) => [...prev, optimisticMessage]);
                  
                  try {
                    await watchAlongFirebaseService.sendMessage(
                      messageText,
                      user.id,
                      user.name || undefined
                    );
                    console.log('[WatchAlong] ✅ Message sent');
                  } catch (error: any) {
                    console.error('[WatchAlong] ❌ Error sending message:', error);
                    // Remove optimistic message on error
                    setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
                    Alert.alert('Error', 'Failed to send message');
                  }
                  
                  // Auto-scroll
                  setTimeout(() => {
                    if (flatListRef.current) {
                      flatListRef.current.scrollToEnd({ animated: true });
                    }
                  }, 100);
                }}
                disabled={!inputMessage.trim()}
              >
                <Ionicons name="send" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!showChat && (
          <TouchableOpacity
            style={styles.chatToggleButton}
            onPress={() => setShowChat(true)}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#FFFFFF" />
            <Text style={styles.chatToggleText}>Chat</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Watch Along</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Ionicons name="play-circle" size={100} color="#FFB020" />
        <Text style={styles.title}>Watch Together</Text>
        <Text style={styles.subtitle}>
          Paste a YouTube URL to watch videos in sync with friends
        </Text>

        <View style={styles.inputSection}>
          <TextInput
            style={styles.input}
            placeholder="Paste YouTube URL here"
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            value={videoUrl}
            onChangeText={setVideoUrl}
            autoCapitalize="none"
            editable={roomState !== 'creating' && roomState !== 'joining'}
          />

          <TouchableOpacity
            style={[styles.createButton, (roomState === 'creating' || roomState === 'joining') && styles.createButtonDisabled]}
            onPress={handleCreateRoom}
            disabled={roomState === 'creating' || roomState === 'joining'}
          >
            {roomState === 'creating' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createButtonText}>Create Watch Room</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.joinSection}>
          <TextInput
            style={styles.input}
            placeholder="Enter room code (6 digits)"
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            value={roomCode || ''}
            onChangeText={setRoomCode}
            maxLength={6}
            editable={roomState !== 'creating' && roomState !== 'joining'}
          />

          <TouchableOpacity
            style={[styles.joinButton, (roomState === 'creating' || roomState === 'joining') && styles.joinButtonDisabled]}
            onPress={handleJoinRoom}
            disabled={roomState === 'creating' || roomState === 'joining'}
          >
            {roomState === 'joining' ? (
              <ActivityIndicator color="#7C3AED" />
            ) : (
              <Text style={styles.joinButtonText}>Join Room</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>How it works:</Text>
          <Text style={styles.infoText}>• Paste a YouTube video URL</Text>
          <Text style={styles.infoText}>• Create a room or join with code</Text>
          <Text style={styles.infoText}>• Watch in perfect sync</Text>
          <Text style={styles.infoText}>• Host controls playback for everyone</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  roomCode: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
  },
  headerRight: {
    width: 40,
  },
  hostBadge: {
    backgroundColor: '#FFB020',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  hostBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputSection: {
    width: '100%',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#FFB020',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 16,
    fontSize: 14,
  },
  joinSection: {
    width: '100%',
    marginBottom: 24,
  },
  joinButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#7C3AED',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: '#7C3AED',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    marginTop: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
  },
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#1A1A1A',
    gap: 16,
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    borderRadius: 8,
  },
  controlButtonActive: {
    backgroundColor: '#FFB020',
  },
  viewerBadge: {
    padding: 16,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
  },
  viewerText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  chatSection: {
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: 300,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  chatHeaderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  chatMessagesContainer: {
    flex: 1,
    maxHeight: 200,
  },
  chatMessagesList: {
    flex: 1,
  },
  chatMessagesContent: {
    padding: 8,
  },
  chatMessage: {
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
    maxWidth: '80%',
  },
  chatMessageSelf: {
    backgroundColor: '#4A90E2',
    alignSelf: 'flex-end',
  },
  chatMessageOther: {
    backgroundColor: '#2A2A2A',
    alignSelf: 'flex-start',
  },
  chatMessageSender: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 4,
  },
  chatMessageText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  chatInputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: '#FFFFFF',
    marginRight: 8,
  },
  chatSendButton: {
    backgroundColor: '#4A90E2',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatSendButtonDisabled: {
    opacity: 0.5,
  },
  chatToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  chatToggleText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 8,
  },
});
