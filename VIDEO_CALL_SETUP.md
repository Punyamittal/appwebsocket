# Video Call Implementation for SkipOn

## Overview

Video calling has been implemented in SkipOn using **WebRTC** for peer-to-peer video/audio and **Socket.IO** for signaling.

## Architecture

```
Frontend (WebRTC) ←→ Socket.IO Signaling ←→ Backend (Socket.IO Server)
         ↓
    Peer Connection
         ↓
    STUN/TURN Servers
```

## Features

✅ **Initiate video calls** - Tap video button in chat header  
✅ **Accept/reject incoming calls** - Incoming call dialog  
✅ **Toggle video/audio** - Mute/unmute controls  
✅ **End calls** - End call button  
✅ **Real-time video/audio** - WebRTC peer-to-peer connection  

## Components

### Backend

1. **`video_call_service.py`** - Manages active video calls
2. **Socket.IO Events** (in `server.py`):
   - `skipon_video_call_initiate` - Start a call
   - `skipon_video_call_answer` - Accept/reject call
   - `skipon_video_call_offer` - WebRTC offer
   - `skipon_video_call_answer_webrtc` - WebRTC answer
   - `skipon_video_call_ice_candidate` - ICE candidate exchange
   - `skipon_video_call_end` - End call
   - `skipon_video_call_join_room` - Join signaling room
   - `skipon_video_call_leave_room` - Leave signaling room

### Frontend

1. **`skipOnVideoCallService.ts`** - WebRTC service with Socket.IO signaling
2. **`VideoCallView.tsx`** - Video call UI component
3. **Integration in `chat-on.tsx`** - Video call button and handlers

## Usage

### Starting a Video Call

1. Wait for match (both users in room)
2. Tap the **video camera icon** in the chat header
3. Grant camera/microphone permissions
4. Call is initiated and partner receives notification

### Answering a Call

1. Incoming call dialog appears
2. Tap **Accept** or **Decline**
3. If accepted, video call starts

### During a Call

- **Toggle Video**: Tap video icon to mute/unmute camera
- **Toggle Audio**: Tap microphone icon to mute/unmute audio
- **End Call**: Tap red phone icon

## Requirements

### Browser/Platform Support

- **Web**: Full WebRTC support (Chrome, Firefox, Safari, Edge)
- **React Native**: Requires `react-native-webrtc` package (not included yet)
- **HTTPS Required**: WebRTC requires HTTPS in production (localhost works for development)

### Permissions

- **Camera**: Required for video
- **Microphone**: Required for audio

## STUN/TURN Servers

Currently using Google's public STUN servers:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

For production, you may need TURN servers for users behind strict NATs:
- Consider using services like Twilio, Vonage, or self-hosted Coturn

## Testing

### Local Development

1. Start backend server:
   ```bash
   cd app/backend
   python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
   ```

2. Start frontend:
   ```bash
   cd app/frontend
   npm start
   ```

3. Open two browser windows/tabs
4. Match two users
5. Click video button in one window
6. Accept call in the other window

### Production Considerations

1. **HTTPS**: WebRTC requires HTTPS (except localhost)
2. **TURN Servers**: Add TURN servers for better connectivity
3. **Error Handling**: Add retry logic for failed connections
4. **Bandwidth**: Monitor and optimize video quality based on connection

## Troubleshooting

### Camera/Microphone Not Working

- Check browser permissions
- Ensure HTTPS (production) or localhost (development)
- Check browser console for errors

### Call Not Connecting

- Check Socket.IO connection (backend logs)
- Verify STUN/TURN servers are accessible
- Check firewall/NAT settings
- Consider adding TURN servers

### Video Quality Issues

- Adjust video constraints in `skipOnVideoCallService.ts`
- Implement adaptive bitrate
- Add bandwidth detection

## Future Enhancements

- [ ] Screen sharing
- [ ] Group video calls
- [ ] Recording calls
- [ ] Video filters/effects
- [ ] React Native support (with react-native-webrtc)
- [ ] Better error handling and reconnection
- [ ] Call quality indicators
- [ ] Bandwidth optimization

## Notes

- WebRTC is **peer-to-peer** - video/audio streams directly between users
- Socket.IO is only used for **signaling** (offer/answer/ICE candidates)
- No video data passes through the server (privacy-friendly)
- STUN servers help with NAT traversal
- TURN servers may be needed for some network configurations

---

**Video calling is now ready to use!** 🎥📞



