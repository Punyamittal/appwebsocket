/**
 * Video Call View Component
 * Displays local and remote video streams
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

interface VideoCallViewProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCallActive: boolean;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  onEndCall: () => void;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  partnerName?: string;
  messages?: Array<{ message_id: string; message: string; is_self: boolean; timestamp: string }>;
  inputMessage?: string;
  onInputChange?: (text: string) => void;
  onSendMessage?: () => void;
  roomReady?: boolean;
}

export default function VideoCallView({
  localStream,
  remoteStream,
  isCallActive,
  isVideoEnabled,
  isAudioEnabled,
  onEndCall,
  onToggleVideo,
  onToggleAudio,
  partnerName = 'Partner',
  messages = [],
  inputMessage = '',
  onInputChange,
  onSendMessage,
  roomReady = true,
}: VideoCallViewProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const messagesListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // For web: attach streams to video elements
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (localVideoRef.current) {
        if (localStream) {
          localVideoRef.current.srcObject = localStream;
          console.log('[VideoCallView] ✅ Local stream attached:', localStream.id, localStream.getTracks().length, 'tracks');
        } else {
          localVideoRef.current.srcObject = null;
        }
      }
      if (remoteVideoRef.current) {
        if (remoteStream) {
          const videoElement = remoteVideoRef.current;
          
          // Check if stream has active tracks
          const activeTracks = remoteStream.getTracks().filter(t => t.readyState === 'live' && t.enabled);
          console.log('[VideoCallView] Remote stream tracks:', {
            total: remoteStream.getTracks().length,
            active: activeTracks.length,
            video: remoteStream.getVideoTracks().length,
            audio: remoteStream.getAudioTracks().length
          });
          
          // Only update if stream is different
          if (videoElement.srcObject !== remoteStream) {
            // Clear previous stream first
            if (videoElement.srcObject) {
              const oldStream = videoElement.srcObject as MediaStream;
              oldStream.getTracks().forEach(track => track.stop());
              videoElement.srcObject = null;
            }
            // Set new stream
            videoElement.srcObject = remoteStream;
            console.log('[VideoCallView] ✅ Remote stream attached:', remoteStream.id, remoteStream.getTracks().map(t => t.kind).join(','));
          }
          
          // Force play with multiple retries
          const attemptPlay = async (retries = 3) => {
            if (!videoElement || videoElement.srcObject !== remoteStream) return;
            
            try {
              if (videoElement.paused) {
                await videoElement.play();
                console.log('[VideoCallView] ✅ Remote video started playing');
              } else {
                console.log('[VideoCallView] ✅ Remote video already playing');
              }
            } catch (err: any) {
              if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
                // These are usually harmless
                console.log('[VideoCallView] Play blocked (harmless):', err.name);
              } else if (retries > 0) {
                console.warn('[VideoCallView] ⚠️ Play failed, retrying...', err?.name || 'Unknown error');
                setTimeout(() => attemptPlay(retries - 1), 200);
              } else {
                console.error('[VideoCallView] ❌ Error playing remote video after retries:', err?.message || err?.name || 'Unknown error');
              }
            }
          };
          
          // Try to play immediately and also after a delay
          setTimeout(() => attemptPlay(), 100);
          setTimeout(() => attemptPlay(), 500);
        } else {
          if (remoteVideoRef.current.srcObject) {
            const oldStream = remoteVideoRef.current.srcObject as MediaStream;
            oldStream.getTracks().forEach(track => track.stop());
            remoteVideoRef.current.srcObject = null;
          }
          console.log('[VideoCallView] ⚠️ Remote stream is null');
        }
      }
    }
  }, [localStream, remoteStream]);

  // Limit messages to last 5 (FIFO - remove oldest when 6th arrives)
  const displayedMessages = messages.slice(-5);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (displayedMessages.length > 0) {
      setTimeout(() => {
        messagesListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [displayedMessages.length]);

  // Clear messages when call ends
  useEffect(() => {
    if (!isCallActive && displayedMessages.length > 0) {
      // Messages will be cleared by parent component
    }
  }, [isCallActive]);

  const renderMessage = ({ item }: { item: typeof messages[0] }) => {
    const isMe = item.is_self;
    return (
      <View style={styles.floatingMessage}>
        <View style={[
          styles.floatingMessageBubble,
          isMe ? styles.floatingMessageBubbleMe : styles.floatingMessageBubbleOther
        ]}>
          <Text style={styles.floatingMessageLabel}>
            {isMe ? 'me' : 'other'}
          </Text>
          <Text style={styles.floatingMessageText}>{item.message}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Remote video (full screen background) */}
      <View style={styles.remoteVideoContainer}>
        {Platform.OS === 'web' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={false}
            style={styles.remoteVideo}
            onLoadedMetadata={() => {
              if (remoteVideoRef.current && !remoteVideoRef.current.paused) {
                console.log('[VideoCallView] ✅ Remote video metadata loaded, playing');
              }
            }}
            onCanPlay={() => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current.play().catch(err => {
                  if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                    console.warn('[VideoCallView] ⚠️ onCanPlay: play() failed:', err.name);
                  }
                });
              }
            }}
          />
        ) : (
          <View style={styles.remoteVideoPlaceholder}>
            <Ionicons name="person" size={80} color="#666" />
            <Text style={styles.placeholderText}>{partnerName}</Text>
          </View>
        )}
        {!isCallActive && (
          <View style={styles.callStatusOverlay}>
            <Text style={styles.callStatusText}>Connecting...</Text>
          </View>
        )}
      </View>

      {/* Local video (picture-in-picture) */}
      <View style={styles.localVideoContainer}>
        {Platform.OS === 'web' ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={styles.localVideo}
          />
        ) : (
          <View style={styles.localVideoPlaceholder}>
            <Ionicons name="videocam" size={40} color="#666" />
          </View>
        )}
      </View>

      {/* Floating Chat Messages */}
      <View style={styles.floatingChatContainer}>
        <FlatList
          ref={messagesListRef}
          data={displayedMessages}
          keyExtractor={(item) => item.message_id}
          renderItem={renderMessage}
          contentContainerStyle={styles.floatingMessagesList}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          style={styles.floatingChatList}
        />
      </View>

      {/* Floating Input Box */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.floatingInputContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
      >
        <View style={styles.floatingInputBox}>
          <TextInput
            style={styles.floatingInput}
            placeholder={roomReady ? "Type a message..." : "Waiting..."}
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            value={inputMessage}
            onChangeText={onInputChange}
            multiline
            maxLength={500}
            editable={roomReady}
          />
          <TouchableOpacity
            style={[styles.floatingSendButton, (!roomReady || !inputMessage.trim()) && styles.floatingSendButtonDisabled]}
            onPress={onSendMessage}
            disabled={!roomReady || !inputMessage.trim()}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, !isVideoEnabled && styles.controlButtonDisabled]}
          onPress={onToggleVideo}
        >
          <Ionicons
            name={isVideoEnabled ? 'videocam' : 'videocam-off'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, !isAudioEnabled && styles.controlButtonDisabled]}
          onPress={onToggleAudio}
        >
          <Ionicons
            name={isAudioEnabled ? 'mic' : 'mic-off'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.endCallButton]}
          onPress={onEndCall}
        >
          <Ionicons name="call" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1000,
  },
  remoteVideoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  remoteVideoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  callStatusOverlay: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1001,
  },
  callStatusText: {
    color: '#fff',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  localVideoContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 1002,
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
    }),
  },
  localVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  localVideoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingChatContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 240, // Keep below local video (which ends at 220px from top)
    bottom: 200,
    zIndex: 1003,
    overflow: 'visible',
    ...Platform.select({
      web: {
        maxHeight: 'calc(100vh - 460px)', // Reduced to prevent overlap with local video and controls
      },
      default: {
        maxHeight: 200, // Reduced height to prevent overlap
      },
    }),
  },
  floatingChatList: {
    flexGrow: 0,
    overflow: 'visible',
  },
  floatingMessagesList: {
    justifyContent: 'flex-end',
    paddingBottom: 12,
    paddingTop: 8,
    flexGrow: 0,
  },
  floatingMessage: {
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  floatingMessageBubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '80%',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
      },
    }),
  },
  floatingMessageBubbleMe: {
    backgroundColor: 'rgba(74, 144, 226, 0.4)',
  },
  floatingMessageBubbleOther: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  floatingMessageLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  floatingMessageText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  floatingInputContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1004,
  },
  floatingInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    gap: 12,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
      },
    }),
  },
  floatingInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  floatingSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4A90E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingSendButtonDisabled: {
    opacity: 0.4,
  },
  controls: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 20,
    zIndex: 1005,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
      },
    }),
  },
  controlButtonDisabled: {
    backgroundColor: 'rgba(211, 47, 47, 0.8)',
  },
  endCallButton: {
    backgroundColor: '#d32f2f',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
});



