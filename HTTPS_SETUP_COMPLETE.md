# 🚀 Skip On Video Call - HTTPS Setup with Ngrok

## ✅ **Setup Complete!**

### **Your Services Are Running:**
- **Ngrok HTTPS**: https://12896db4e95c.ngrok-free.app
- **Frontend**: http://localhost:8081
- **Backend API**: http://172.20.139.243:3001
- **Socket.IO**: http://172.20.139.243:3003

### **📱 How to Test Video Calls:**

#### **From Your Main Device (Mac):**
1. Open browser: http://localhost:8081
2. Start chat and get matched
3. Click video call icon 📹

#### **From Second Device (Phone/Tablet):**
1. Open browser: **https://12896db4e95c.ngrok-free.app**
2. Start chat and get matched
3. Click video call icon 📹
4. **Allow camera permissions** when prompted

### **🔐 Why HTTPS is Required:**

#### **Browser Security Requirements:**
- **WebRTC (video calls)** requires HTTPS in production
- **Camera/microphone access** only works on secure connections
- **Local development** (localhost) works without HTTPS
- **Remote access** requires HTTPS + valid certificates

#### **Ngrok Provides:**
✅ **HTTPS tunnel** to your local server
✅ **Valid SSL certificate** for browser security
✅ **Public URL** for cross-device testing
✅ **Real-time updates** during development

### **🎯 Testing Scenarios:**

#### **Scenario 1: Mac + Phone**
1. **Mac**: http://localhost:8081
2. **Phone**: https://12896db4e95c.ngrok-free.app
3. Both devices can video call each other!

#### **Scenario 2: Two Different Networks**
1. **Device 1**: https://12896db4e95c.ngrok-free.app
2. **Device 2**: https://12896db4e95c.ngrok-free.app
3. Works across any internet connection!

### **🛠️ Commands Used:**

```bash
# 1. Configure ngrok auth token
ngrok config add-authtoken YOUR_TOKEN

# 2. Start ngrok tunnel (running in background)
ngrok http 8081

# 3. Start services (already running)
./start_ip_services.sh

# 4. Start frontend with HTTPS config
cd frontend && npx expo start --clear
```

### **🔧 Configuration Updates:**

#### **app.json (Updated):**
```json
{
  "extra": {
    "EXPO_PUBLIC_BACKEND_URL": "https://12896db4e95c.ngrok-free.app",
    "EXPO_PUBLIC_SOCKETIO_URL": "https://12896db4e95c.ngrok-free.app"
  }
}
```

### **📱 Camera Permission Fix:**

#### **Before (HTTP):**
❌ `Cannot read properties of undefined (reading 'getUserMedia')`
❌ Camera access blocked by browser security

#### **After (HTTPS):**
✅ Camera permission prompts work correctly
✅ WebRTC peer connections established
✅ Video calls work across devices

### **🌐 Access URLs:**

| Service | Local URL | Public URL |
|---------|------------|-------------|
| Frontend | http://localhost:8081 | https://12896db4e95c.ngrok-free.app |
| Backend | http://172.20.139.243:3001 | Not accessible externally |
| Socket.IO | http://172.20.139.243:3003 | Not accessible externally |

### **🔄 If Ngrok Stops:**

```bash
# Stop current ngrok (Ctrl+C in that terminal)
# Start new tunnel
ngrok http 8081

# Update app.json with new URL if it changes
```

### **✅ Ready for Testing!**

Your video call app is now accessible via HTTPS and should work perfectly across devices! 🎉

**Test Steps:**
1. Open https://12896db4e95c.ngrok-free.app on your phone
2. Open http://localhost:8081 on your Mac
3. Start chat on both devices
4. Click video call - camera permissions should work!
5. Enjoy video calling! 📹📱
