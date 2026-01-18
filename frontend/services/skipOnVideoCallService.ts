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

    // Reset any existing peer connection
    if (this.peerConnection) {
      console.log('[VideoCall] 🔄 Closing existing peer connection before creating new one');
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Get local media stream
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera/Microphone not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
      }
      
      // Request media with proper user gesture handling
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      console.log('[VideoCall] ✅ Local stream obtained');
    } catch (error: any) {
      console.error('[VideoCall] ❌ Failed to get local stream:', error);
      
      // Handle different error types
      if (error.name === 'NotAllowedError') {
        throw new Error('Camera/Microphone permission denied. Please allow camera access in browser settings.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No camera/microphone found. Please connect a camera device.');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Camera is already in use by another application.');
      } else if (error.message && error.message.includes('not supported')) {
        throw new Error('Camera/Microphone not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
      } else {
        throw new Error(`Failed to access camera/microphone: ${error.message || 'Unknown error'}`);
      }
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

    // Create and send offer (peer connection already created above)
    if (this.peerConnection) {
      const offer = await (this.peerConnection as RTCPeerConnection).createOffer();
      await (this.peerConnection as RTCPeerConnection).setLocalDescription(offer);
      
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
        // Check if mediaDevices is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera/Microphone not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
        }
        
        // Request media with proper user gesture handling
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log('[VideoCall] ✅ Local stream obtained');
      } catch (error: any) {
        console.error('[VideoCall] ❌ Failed to get local stream:', error);
        
        // Handle different error types
        if (error.name === 'NotAllowedError') {
          throw new Error('Camera/Microphone permission denied. Please allow camera access in browser settings.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No camera/microphone found. Please connect a camera device.');
        } else if (error.name === 'NotReadableError') {
          throw new Error('Camera is already in use by another application.');
        } else if (error.message && error.message.includes('not supported')) {
          throw new Error('Camera/Microphone not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
        } else {
          throw new Error(`Failed to access camera/microphone: ${error.message || 'Unknown error'}`);
        }
      }

      // Check if peer connection already exists (created by handleOffer)
      // If it exists, just add local stream to it instead of recreating
      if (!this.peerConnection) {
        console.log('[VideoCall] No existing peer connection, creating new one');
        // Create peer connection only if it doesn't exist
        this.createPeerConnection();
      } else {
        console.log('[VideoCall] ✅ Reusing existing peer connection (from handleOffer)');
      }

      // Add local stream to peer connection
      if (this.localStream && this.peerConnection) {
        // Check if tracks are already added
        const existingSenders = this.peerConnection.getSenders();
        const hasLocalTracks = existingSenders.some(sender => {
          const track = sender.track;
          return track && this.localStream?.getTracks().includes(track);
        });

        if (!hasLocalTracks) {
          console.log('[VideoCall] ➕ Adding local tracks to existing peer connection');
          this.localStream.getTracks().forEach(track => {
            this.peerConnection?.addTrack(track, this.localStream!);
            console.log('[VideoCall] 🎤 Added track:', track.kind, track.enabled);
          });
        } else {
          console.log('[VideoCall] ✅ Local tracks already added to peer connection');
        }
      }

      // Join room (if not already joined)
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
    // Close existing peer connection if any
    if (this.peerConnection) {
      console.warn('[VideoCall] ⚠️ Creating new peer connection while one already exists. Closing old one.');
      try {
        this.peerConnection.close();
      } catch (e) {
        console.warn('[VideoCall] Error closing existing peer connection:', e);
      }
      this.peerConnection = null;
    }

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    console.log('[VideoCall] 🔄 Creating new peer connection');
    this.peerConnection = new RTCPeerConnection(configuration);

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[VideoCall] 🎥 REMOTE TRACK RECEIVED!', event.track?.kind);
      console.log('[VideoCall] Remote streams:', event.streams?.length);
      console.log('[VideoCall] Event details:', {
        trackKind: event.track?.kind,
        streamCount: event.streams?.length,
        trackEnabled: event.track?.enabled,
        trackId: event.track?.id
      });
      
      // Handle both cases: event.streams[0] or create new stream
      let remoteStream: MediaStream | null = null;
      
      if (event.streams && event.streams.length > 0) {
        remoteStream = event.streams[0];
        console.log('[VideoCall] ✅ Using stream from event.streams[0]');
      } else if (event.track) {
        // Create new stream if none provided
        remoteStream = new MediaStream();
        remoteStream.addTrack(event.track);
        console.log('[VideoCall] ✅ Created new stream and added track');
      }
      
      if (remoteStream) {
        console.log('[VideoCall] 📹 Remote stream ready:', {
          streamId: remoteStream.id,
          tracks: remoteStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id }))
        });
        
        if (this.callbacks.onRemoteStream) {
          this.callbacks.onRemoteStream(remoteStream);
          console.log('[VideoCall] ✅ Remote stream callback triggered with stream:', remoteStream.id);
        }
      } else {
        console.error('[VideoCall] ❌ No remote stream could be created');
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket?.connected && this.currentRoomId && this.peerConnection) {
        this.socket.emit('skipon_video_call_ice_candidate', {
          roomId: this.currentRoomId,
          candidate: event.candidate,
          senderId: this.currentUserId,
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      const signalingState = this.peerConnection?.signalingState;
      console.log('[VideoCall] Connection state changed:', {
        connectionState: state,
        signalingState: signalingState,
        remoteDescription: this.peerConnection?.remoteDescription?.type || 'none'
      });
      
      if (state === 'connected') {
        console.log('[VideoCall] ✅ Peer connection established!');
      } else if (state === 'disconnected') {
        console.log('[VideoCall] ⚠️ Peer connection disconnected');
      } else if (state === 'failed') {
        console.error('[VideoCall] ❌ Peer connection failed');
        if (this.callbacks.onError) {
          this.callbacks.onError('Connection failed');
        }
      } else if (state === 'new') {
        console.log('[VideoCall] ⚠️ Peer connection reset to new state');
      }
    };
    
    // Also log ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[VideoCall] ICE connection state:', this.peerConnection?.iceConnectionState);
    };
  }

  /**
   * Handle WebRTC offer
   */
  private async handleOffer(offer: RTCSessionDescriptionInit, roomId: string): Promise<void> {
    // Reset any existing peer connection before handling new offer
    if (this.peerConnection) {
      console.log('[VideoCall] 🔄 Closing existing peer connection before handling new offer');
      (this.peerConnection as RTCPeerConnection).close();
      this.peerConnection = null;
    }

    // Create fresh peer connection
    this.createPeerConnection();

    // Add local stream to peer connection
    if (this.localStream && this.peerConnection) {
      console.log('[VideoCall] ➕ Adding local tracks to peer connection (callee)');
      this.localStream.getTracks().forEach(track => {
        console.log('[VideoCall] 🎤 Adding track (callee):', track.kind, track.enabled);
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    // Handle the offer
    if (this.peerConnection) {
      console.log('[VideoCall] 📥 Setting remote description (offer)');
      console.log('[VideoCall] Current signaling state:', (this.peerConnection as RTCPeerConnection).signalingState);
      
      try {
        await (this.peerConnection as RTCPeerConnection).setRemoteDescription(new RTCSessionDescription(offer));
        console.log('[VideoCall] ✅ Remote description (offer) set successfully');
        
        // Create and send answer
        const answer = await (this.peerConnection as RTCPeerConnection).createAnswer();
        await (this.peerConnection as RTCPeerConnection).setLocalDescription(answer);
        
        console.log('[VideoCall] 📤 Sending answer');
        if (this.socket?.connected) {
          this.socket.emit('skipon_video_call_answer_webrtc', {
            roomId,
            answer,
            senderId: this.currentUserId,
          });
        }
        
        // Process any buffered ICE candidates
        this.processBufferedIceCandidates();
      } catch (error) {
        console.error('[VideoCall] ❌ Error handling offer:', error);
        // Don't throw - let the call continue
      }
    }
  }

  /**
   * Handle WebRTC answer
   */
  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      console.error('[VideoCall] ❌ Cannot set remote description: peer connection is null');
      return;
    }

    console.log('[VideoCall] 📥 Setting remote description (answer)');
    console.log('[VideoCall] Current signaling state:', (this.peerConnection as RTCPeerConnection).signalingState);
    console.log('[VideoCall] Remote description before setting:', (this.peerConnection as RTCPeerConnection).remoteDescription?.type);
    
    try {
      await (this.peerConnection as RTCPeerConnection).setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[VideoCall] ✅ Remote description (answer) set successfully');
      console.log('[VideoCall] Remote description after setting:', (this.peerConnection as RTCPeerConnection).remoteDescription?.type);
      console.log('[VideoCall] New signaling state:', (this.peerConnection as RTCPeerConnection).signalingState);
      
      // Process any buffered ICE candidates
      this.processBufferedIceCandidates();
    } catch (error: any) {
      console.error('[VideoCall] ❌ Error setting remote description (answer):', error);
      console.error('[VideoCall] Error details:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });
      if (this.callbacks.onError) {
        this.callbacks.onError(`Failed to set remote description: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Handle ICE candidate
   */
  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection) {
      console.log('[VideoCall] 📥 Adding ICE candidate');
      console.log('[VideoCall] Current signaling state:', (this.peerConnection as RTCPeerConnection).signalingState);
      console.log('[VideoCall] Remote description set:', (this.peerConnection as RTCPeerConnection).remoteDescription !== null);
      
      try {
        // Only add ICE candidate if remote description is set
        if ((this.peerConnection as RTCPeerConnection).remoteDescription) {
          await (this.peerConnection as RTCPeerConnection).addIceCandidate(new RTCIceCandidate(candidate));
          console.log('[VideoCall] ✅ ICE candidate added successfully');
        } else {
          console.warn('[VideoCall] ⚠️ ICE candidate received but remote description not set yet, buffering...');
          // Buffer the candidate for later
          this.bufferIceCandidate(candidate);
        }
      } catch (error) {
        console.error('[VideoCall] ❌ Error adding ICE candidate:', error);
        // Don't throw - let the call continue
      }
    }
  }

  /**
   * Buffer ICE candidates when remote description is not set
   */
  private iceCandidateBuffer: RTCIceCandidateInit[] = [];

  private bufferIceCandidate(candidate: RTCIceCandidateInit): void {
    this.iceCandidateBuffer.push(candidate);
    console.log('[VideoCall] 📦 Buffered ICE candidate, total:', this.iceCandidateBuffer.length);
  }

  /**
   * Process buffered ICE candidates
   */
  private async processBufferedIceCandidates(): Promise<void> {
    if (this.iceCandidateBuffer.length > 0 && this.peerConnection?.remoteDescription) {
      console.log('[VideoCall] 📤 Processing buffered ICE candidates:', this.iceCandidateBuffer.length);
      
      // Process all candidates sequentially to avoid race conditions
      const candidates = [...this.iceCandidateBuffer];
      this.iceCandidateBuffer = [];
      
      for (const candidate of candidates) {
        try {
          if (this.peerConnection?.remoteDescription) {
            await (this.peerConnection as RTCPeerConnection).addIceCandidate(new RTCIceCandidate(candidate));
            console.log('[VideoCall] ✅ Buffered ICE candidate added');
          }
        } catch (error) {
          console.error('[VideoCall] ❌ Error adding buffered ICE candidate:', error);
        }
      }
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



