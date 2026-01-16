# 🚀 Skip On App - Network Testing Setup

## ✅ Services Running on Your IP: 172.20.139.243

### Server Endpoints:
- **FastAPI (REST + Socket.IO)**: http://172.20.139.243:3001
- **FastAPI (Socket.IO only)**: http://172.20.139.243:3003  
- **Engage Server**: http://172.20.139.243:3002
- **Frontend**: http://172.20.139.243:8081

### 📱 Testing Video Calls Between Mac and Phone:

#### From your Mac:
1. Open browser and go to: http://172.20.139.243:8081
2. Start chat and match with someone
3. Click video call icon to start video call

#### From your Phone:
1. Connect to the same WiFi network as your Mac
2. Open browser and go to: http://172.20.139.243:8081
3. Start chat and match with your Mac (or another device)
4. Click video call icon when connected

### 🔧 How it Works:
- **Chat messages**: Use REST API (port 3001) + Socket.IO (port 3003)
- **Video calls**: Use Socket.IO signaling (port 3003) + WebRTC peer-to-peer
- **Matchmaking**: Uses Redis queue for scalable user matching

### 📋 Quick Commands:
```bash
# Start all services on IP address
./START_SERVERS_IP.ps1

# Or start individually:
cd backend && npm run dev:ip          # FastAPI servers
cd backend && npm run dev:ip:engage   # Engage server  
cd frontend && npx expo start --clear    # Frontend
```

### 🌐 Network Requirements:
- Both devices must be on the same WiFi/network
- Firewall should allow ports 3001, 3002, 3003, 8081
- For testing across internet, configure port forwarding

### 🔍 Troubleshooting:
- If video call doesn't work: Check browser console for errors
- If can't connect: Verify IP address with `ifconfig`
- If page doesn't load: Check if all services are running

---
*Ready for video call testing!* 📹
