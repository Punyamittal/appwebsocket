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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

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
}: VideoCallViewProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // For web: attach streams to video elements
  useEffect(() => {
    if (Platform.OS === 'web' && localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
    if (Platform.OS === 'web' && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Remote video (main view) */}
      <View style={styles.remoteVideoContainer}>
        {Platform.OS === 'web' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={styles.remoteVideo}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideoContainer: {
    flex: 1,
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
    top: 20,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: '#fff',
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    gap: 20,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonDisabled: {
    backgroundColor: '#d32f2f',
  },
  endCallButton: {
    backgroundColor: '#d32f2f',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
});



