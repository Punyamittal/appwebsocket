/**
 * Sing Along Screen (Phase 1)
 * 
 * Phase 1: Same as Watch Along
 * - YouTube karaoke video sync
 * - Host controls playback
 * - Real-time sync via REST API + polling
 * 
 * Phase 2 (Future):
 * - WebRTC audio rooms
 * - Echo cancellation
 * - Push-to-sing mode
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import engageService from '../../services/engageService';
import singApiService from '../../services/singApiService';

// Extract YouTube video ID from URL
function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

type RoomState = 'idle' | 'creating' | 'joining' | 'singing' | 'error';

export default function SingAlongScreen() {
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
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const socketRef = useRef<any>(null);

  // Auth check - redirect immediately if not authenticated
  if (!user || user.is_guest || !token) {
    return <Redirect href="/welcome" />;
  }

  // Cleanup
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        engageService.disconnectSingAlong();
      }
      // Stop polling when component unmounts
      singApiService.stopPolling();
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
        if (window.YT && window.YT.Player && iframeRef.current) {
          // Destroy existing player if any
          if (youtubePlayerRef.current) {
            try {
              youtubePlayerRef.current.destroy();
            } catch (e) {
              // Ignore errors
            }
          }

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
                console.log('[SingAlong] YouTube player ready');
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
            },
          });
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
        console.warn('[SingAlong] Error syncing YouTube player:', e);
      }
    }
  }, [currentTime, isPlaying, videoId]);

  const handleCreateRoom = async () => {
    if (!videoUrl.trim()) {
      Alert.alert('Error', 'Please enter a YouTube karaoke URL');
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
      console.log('[SingAlong] Creating room via REST API...');
      const result = await singApiService.createRoom(user.id, extractedId, videoUrl.trim());
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create room');
      }

      if (!result.roomId) {
        throw new Error('Invalid response from server');
      }

      console.log(`[SingAlong] ✅ Room created: ${result.roomId} (Code: ${result.roomCode})`);
      
      // Update state
      setRoomId(result.roomId);
      setRoomCode(result.roomCode);
      setVideoId(result.videoId || extractedId);
      setIsHost(true);
      setIsPlaying(result.isPlaying || false);
      setCurrentTime(result.currentTime || 0);
      setRoomState('singing');
      
      // Start polling for updates
      singApiService.startPolling(result.roomId, (data) => {
        console.log('[SingAlong] Room update:', data);
        if (data.videoId) setVideoId(data.videoId);
        if (data.videoUrl) setVideoUrl(data.videoUrl);
        if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
        if (data.currentTime !== undefined) {
          setCurrentTime(data.currentTime);
          // Sync video player (native only - web uses iframe)
          if (Platform.OS !== 'web' && webViewRef.current && !isHost) {
            webViewRef.current.injectJavaScript(`
              if (player) {
                player.seekTo(${data.currentTime}, true);
                ${data.isPlaying ? 'player.playVideo();' : 'player.pauseVideo();'}
              }
            `);
          }
        }
      }, 2000); // Poll every 2 seconds
      
    } catch (error: any) {
      console.error('[SingAlong] Create room error:', error);
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
      console.log(`[SingAlong] Joining room with code: ${codeToJoin}`);
      const result = await singApiService.joinRoom(user.id, codeToJoin);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to join room');
      }

      if (!result.roomId) {
        throw new Error('Invalid response from server');
      }

      console.log(`[SingAlong] ✅ Joined room: ${result.roomId}`);
      
      // Update state
      setRoomId(result.roomId);
      setRoomCode(result.roomCode || codeToJoin);
      setVideoId(result.videoId);
      setVideoUrl(result.videoUrl || '');
      setIsHost(result.isHost || false);
      setIsPlaying(result.isPlaying || false);
      setCurrentTime(result.currentTime || 0);
      setRoomState('singing');
      
      // Start polling for updates
      singApiService.startPolling(result.roomId, (data) => {
        console.log('[SingAlong] Room update:', data);
        if (data.videoId) setVideoId(data.videoId);
        if (data.videoUrl) setVideoUrl(data.videoUrl);
        if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
        if (data.currentTime !== undefined) {
          setCurrentTime(data.currentTime);
        }
        if (data.isPlaying !== undefined) {
          setIsPlaying(data.isPlaying);
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
            console.warn('[SingAlong] Error syncing YouTube player:', e);
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
      console.error('[SingAlong] Join room error:', error);
      Alert.alert('Error', error.message || 'Failed to join room');
      setRoomState('error');
    }
  };

  // Host controls
  const handlePlay = async () => {
    if (!isHost || !roomId || !user) return;
    
    // Get current time from player if available
    let timeToSync = currentTime;
    if (Platform.OS === 'web' && youtubePlayerRef.current) {
      try {
        timeToSync = youtubePlayerRef.current.getCurrentTime();
      } catch (e) {
        // Use state value if player not ready
      }
    }
    
    try {
      const result = await singApiService.play(roomId, user.id, timeToSync);
      if (result.success) {
        setIsPlaying(true);
        if (result.currentTime !== undefined) {
          setCurrentTime(result.currentTime);
        }
        // Also play local player (host)
        if (Platform.OS === 'web' && youtubePlayerRef.current) {
          youtubePlayerRef.current.playVideo();
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to play');
      }
    } catch (error: any) {
      console.error('[SingAlong] Play error:', error);
      Alert.alert('Error', error.message || 'Failed to play');
    }
  };

  const handlePause = async () => {
    if (!isHost || !roomId || !user) return;
    
    // Get current time from player if available
    let timeToSync = currentTime;
    if (Platform.OS === 'web' && youtubePlayerRef.current) {
      try {
        timeToSync = youtubePlayerRef.current.getCurrentTime();
      } catch (e) {
        // Use state value if player not ready
      }
    }
    
    try {
      const result = await singApiService.pause(roomId, user.id, timeToSync);
      if (result.success) {
        setIsPlaying(false);
        if (result.currentTime !== undefined) {
          setCurrentTime(result.currentTime);
        }
        // Also pause local player (host)
        if (Platform.OS === 'web' && youtubePlayerRef.current) {
          youtubePlayerRef.current.pauseVideo();
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to pause');
      }
    } catch (error: any) {
      console.error('[SingAlong] Pause error:', error);
      Alert.alert('Error', error.message || 'Failed to pause');
    }
  };

  const handleSeek = async (time: number) => {
    if (!isHost || !roomId || !user) return;
    
    try {
      const result = await singApiService.seek(roomId, user.id, time);
      if (result.success) {
        setCurrentTime(time);
        // Seek local player (host)
        if (Platform.OS === 'web' && youtubePlayerRef.current) {
          youtubePlayerRef.current.seekTo(time, true);
        } else if (Platform.OS !== 'web' && webViewRef.current) {
          webViewRef.current.injectJavaScript(`player.seekTo(${time}, true);`);
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to seek');
      }
    } catch (error: any) {
      console.error('[SingAlong] Seek error:', error);
      Alert.alert('Error', error.message || 'Failed to seek');
    }
  };

  const handleChangeVideo = async (newUrl: string) => {
    if (!isHost || !roomId || !user) return;
    
    const newId = extractYouTubeId(newUrl);
    if (!newId) {
      Alert.alert('Error', 'Invalid YouTube URL');
      return;
    }
    
    try {
      const result = await singApiService.changeVideo(roomId, user.id, newId, newUrl);
      if (result.success) {
        setVideoId(newId);
        setVideoUrl(newUrl);
        setCurrentTime(0);
        setIsPlaying(false);
      } else {
        Alert.alert('Error', result.error || 'Failed to change video');
      }
    } catch (error: any) {
      console.error('[SingAlong] Change video error:', error);
      Alert.alert('Error', error.message || 'Failed to change video');
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
                }
              }
            });
          }
        </script>
      </body>
    </html>
  `;

  if (roomState === 'singing' && videoId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Sing Along</Text>
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
            <View style={styles.betaBadge}>
              <Text style={styles.betaText}>BETA</Text>
            </View>
          </View>
        </View>

        <View style={styles.playerContainer}>
          {Platform.OS === 'web' ? (
            // Web: Use iframe directly with YouTube embed
            <iframe
              ref={iframeRef}
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&controls=${isHost ? 1 : 0}&modestbranding=1&start=${Math.floor(currentTime)}`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ border: 'none', width: '100%', height: '100%' }}
              id="youtube-player-iframe"
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

        <View style={styles.phase1Banner}>
          <Ionicons name="information-circle" size={16} color="#10B981" />
          <Text style={styles.phase1Text}>
            Phase 1: YouTube sync only. WebRTC audio coming in Phase 2.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sing Along</Text>
        <View style={styles.betaBadge}>
          <Text style={styles.betaText}>BETA</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Ionicons name="musical-notes" size={100} color="#10B981" />
        <Text style={styles.title}>Sing Together</Text>
        <Text style={styles.subtitle}>
          Paste a YouTube karaoke URL to sing along in sync with friends
        </Text>

        <View style={styles.betaBanner}>
          <Ionicons name="flask" size={20} color="#10B981" />
          <Text style={styles.betaBannerText}>
            Phase 1: YouTube sync. WebRTC audio coming soon!
          </Text>
        </View>

        <View style={styles.inputSection}>
          <TextInput
            style={styles.input}
            placeholder="Paste YouTube karaoke URL here"
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
              <Text style={styles.createButtonText}>Create Karaoke Room</Text>
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
              <ActivityIndicator color="#10B981" />
            ) : (
              <Text style={styles.joinButtonText}>Join Room</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Phase 1 Features:</Text>
          <Text style={styles.infoText}>• YouTube karaoke video sync</Text>
          <Text style={styles.infoText}>• Host controls playback</Text>
          <Text style={styles.infoText}>• Real-time sync for all participants</Text>
          <Text style={styles.infoText}>• Create or join with room code</Text>
        </View>

        <View style={styles.futureBox}>
          <Text style={styles.futureTitle}>Phase 2 (Coming Soon):</Text>
          <Text style={styles.futureText}>• WebRTC audio rooms</Text>
          <Text style={styles.futureText}>• Echo cancellation</Text>
          <Text style={styles.futureText}>• Push-to-sing mode</Text>
          <Text style={styles.futureText}>• Multi-user audio mixing</Text>
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
    flexDirection: 'row',
    gap: 8,
  },
  hostBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  hostBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  betaBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  betaText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
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
    marginBottom: 24,
  },
  betaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  betaBannerText: {
    color: '#10B981',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '600',
    flex: 1,
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
    backgroundColor: '#10B981',
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
    borderColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
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
  futureBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  futureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 12,
  },
  futureText: {
    fontSize: 14,
    color: 'rgba(16, 185, 129, 0.8)',
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
    backgroundColor: '#10B981',
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
  phase1Banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    gap: 8,
  },
  phase1Text: {
    color: '#10B981',
    fontSize: 12,
    flex: 1,
  },
});
