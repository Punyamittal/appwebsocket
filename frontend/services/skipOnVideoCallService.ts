/**
 * SkipOn Video Call Service
 * Handles WebRTC video calling via Socket.IO signaling
 */

import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SOCKETIO_URL || 
                    process.env.EXPO_PUBLIC_SOCKETIO_URL || 
                    'http://localhost:3003';

export interface VideoCallCallbacks {
  onIncomingCall?: (callerId: string, roomId: string) => void;
  onCallAccepted?: (roomId: string) => void;
  onCallRejected?: (roomId: string) => void;
  onCallEnded?: (roomId: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: string) => void;
}

class SkipOnVideoCallService {
  private socket: Socket | null = null;
  private currentRoomId: string | null = null;
  private currentUserId: string | null = null;
  private callbacks: VideoCallCallbacks = {};
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private isCaller: boolean = false;

  /**
   * Initialize Socket.IO connection for video calling
   */
  connect(userId: string, token?: string): void {
    if (this.socket?.connected) {
      console.log('[VideoCall] Socket already connected');
      return;
    }

    this.currentUserId = userId;

    console.log('[VideoCall] Connecting to Socket.IO:', BACKEND_URL);
    this.socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
    });

    this.socket.on('connect', () => {
      console.log('[VideoCall] ✅ Socket connected');
      if (token) {
        this.socket?.emit('authenticate', { token });
      }
    });

    this.socket.on('disconnect', () => {
      console.log('[VideoCall] Socket disconnected');
    });

    this.setupEventHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Incoming call
    this.socket.on('video_call_incoming', (data: any) => {
      console.log('[VideoCall] 📞 Incoming call:', data);
      if (this.callbacks.onIncomingCall) {
        this.callbacks.onIncomingCall(data.callerId, data.roomId);
      }
    });

    // Call accepted
    this.socket.on('video_call_accepted', (data: any) => {
      console.log('[VideoCall] ✅ Call accepted:', data);
      if (this.callbacks.onCallAccepted) {
        this.callbacks.onCallAccepted(data.roomId);
      }
    });

    // Call rejected
    this.socket.on('video_call_rejected', (data: any) => {
      console.log('[VideoCall] ❌ Call rejected:', data);
      if (this.callbacks.onCallRejected) {
        this.callbacks.onCallRejected(data.roomId);
      }
    });

    // Call ended
    this.socket.on('video_call_ended', (data: any) => {
      console.log('[VideoCall] 📴 Call ended:', data);
      this.cleanup();
      if (this.callbacks.onCallEnded) {
        this.callbacks.onCallEnded(data.roomId);
      }
    });

    // WebRTC offer
    this.socket.on('video_call_offer', async (data: any) => {
      console.log('[VideoCall] 📥 Received offer');
      await this.handleOffer(data.offer, data.roomId);
    });

    // WebRTC answer
    this.socket.on('video_call_answer', async (data: any) => {
      console.log('[VideoCall] 📥 Received answer');
      await this.handleAnswer(data.answer);
    });

    // ICE candidate
    this.socket.on('video_call_ice_candidate', async (data: any) => {
      console.log('[VideoCall] 📥 Received ICE candidate');
      await this.handleIceCandidate(data.candidate);
    });

    // Error
    this.socket.on('video_call_error', (data: any) => {
      console.error('[VideoCall] ❌ Error:', data.message);
      if (this.callbacks.onError) {
        this.callbacks.onError(data.message);
      }
    });
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: VideoCallCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Initiate a video call
   */
  async initiateCall(roomId: string, callerId: string, calleeId: string): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    this.currentRoomId = roomId;
    this.isCaller = true;

    // Join video call room
    this.socket.emit('skipon_video_call_join_room', { roomId });

    // Get local media stream
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      console.log('[VideoCall] ✅ Local stream obtained');
    } catch (error: any) {
      console.error('[VideoCall] ❌ Failed to get local stream:', error);
      throw new Error('Failed to access camera/microphone');
    }

    // Create peer connection
    this.createPeerConnection();

    // Add local stream to peer connection
    if (this.localStream && this.peerConnection) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    // Initiate call
    this.socket.emit('skipon_video_call_initiate', {
      roomId,
      callerId,
      calleeId,
    });

    // Create and send offer
    if (this.peerConnection) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.socket.emit('skipon_video_call_offer', {
        roomId,
        offer,
        senderId: callerId,
      });
    }
  }

  /**
   * Answer an incoming call
   */
  async answerCall(roomId: string, answererId: string, accepted: boolean): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    this.socket.emit('skipon_video_call_answer', {
      roomId,
      answererId,
      accepted,
    });

    if (accepted) {
      this.currentRoomId = roomId;
      this.isCaller = false;

      // Get local media stream
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log('[VideoCall] ✅ Local stream obtained');
      } catch (error: any) {
        console.error('[VideoCall] ❌ Failed to get local stream:', error);
        throw new Error('Failed to access camera/microphone');
      }

      // Create peer connection
      this.createPeerConnection();

      // Add local stream
      if (this.localStream && this.peerConnection) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection?.addTrack(track, this.localStream!);
        });
      }

      // Join room
      this.socket.emit('skipon_video_call_join_room', { roomId });
    }
  }

  /**
   * End the current call
   */
  endCall(roomId: string, userId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('skipon_video_call_end', { roomId, userId });
    }
    this.cleanup();
  }

  /**
   * Create WebRTC peer connection
   */
  private createPeerConnection(): void {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[VideoCall] 📹 Remote stream received');
      if (this.callbacks.onRemoteStream && event.streams[0]) {
        this.callbacks.onRemoteStream(event.streams[0]);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket?.connected && this.currentRoomId) {
        this.socket.emit('skipon_video_call_ice_candidate', {
          roomId: this.currentRoomId,
          candidate: event.candidate,
          senderId: this.currentUserId,
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[VideoCall] Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'failed') {
        if (this.callbacks.onError) {
          this.callbacks.onError('Connection failed');
        }
      }
    };
  }

  /**
   * Handle WebRTC offer
   */
  private async handleOffer(offer: RTCSessionDescriptionInit, roomId: string): Promise<void> {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Create and send answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      if (this.socket?.connected) {
        this.socket.emit('skipon_video_call_answer_webrtc', {
          roomId,
          answer,
          senderId: this.currentUserId,
        });
      }
    }
  }

  /**
   * Handle WebRTC answer
   */
  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  /**
   * Handle ICE candidate
   */
  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  /**
   * Get local stream
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Toggle video (mute/unmute)
   */
  toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Toggle audio (mute/unmute)
   */
  toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Leave room
    if (this.socket?.connected && this.currentRoomId) {
      this.socket.emit('skipon_video_call_leave_room', { roomId: this.currentRoomId });
    }

    this.currentRoomId = null;
    this.isCaller = false;
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.cleanup();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new SkipOnVideoCallService();



