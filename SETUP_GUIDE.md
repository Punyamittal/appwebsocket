# 🚀 Project Setup Guide

Complete guide to set up and run this project from scratch.

## 📋 Prerequisites

Before starting, make sure you have the following installed:

### Required Software

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - Verify: `node --version`

2. **Python** (v3.8 or higher)
   - Download from: https://www.python.org/
   - Verify: `python3 --version`

3. **Redis** (for caching and real-time features)
   - **macOS**: `brew install redis`
   - **Windows**: Download from https://redis.io/download or use Docker
   - **Linux**: `sudo apt-get install redis-server` or use Docker
   - **Docker** (Alternative): `docker run -d -p 6379:6379 --name redis redis:latest`

4. **MongoDB** (database)
   - Download from: https://www.mongodb.com/try/download/community
   - Or use MongoDB Atlas (cloud): https://www.mongodb.com/cloud/atlas

5. **Git** (optional, for version control)
   - Usually pre-installed on macOS/Linux
   - Windows: Download from https://git-scm.com/

### Optional but Recommended

- **VS Code** or **Cursor** (code editor)
- **Postman** or **Insomnia** (API testing)

---

## 📦 Installation Steps

### Step 1: Extract the Project

1. Extract the zip file to a folder (e.g., `app-1`)
2. Open terminal/command prompt
3. Navigate to the project folder:
   ```bash
   cd app-1
   ```

### Step 2: Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

**Note:** This may take 5-10 minutes depending on your internet speed.

### Step 3: Install Backend Dependencies

```bash
cd backend
pip3 install -r requirements.txt
cd ..
```

**Note:** On some systems, you may need to use `pip` instead of `pip3`.

### Step 4: Set Up Environment Variables

Create a `.env` file in the `backend` folder:

```bash
cd backend
touch .env  # macOS/Linux
# OR
type nul > .env  # Windows
```

Add the following to `backend/.env`:

```env
# MongoDB Connection
MONGODB_URL=mongodb://localhost:27017/gingr
# OR use MongoDB Atlas:
# MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/gingr

# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Secret (generate a random string)
JWT_SECRET=your-secret-key-here-change-this

# Server Ports
PORT=3001
ENGAGE_PORT=3002
```

**Important:** Replace `your-secret-key-here-change-this` with a random string for security.

---

## 🏃 Running the Project

You need to run **4 terminals** (or terminal tabs) for all services:

### Terminal 1: Redis Server

```bash
# macOS/Linux
redis-server

# OR using the project script
cd backend
./start-redis.sh

# Windows (if installed)
redis-server

# OR using Docker
docker start redis
# OR
docker run -d -p 6379:6379 --name redis redis:latest
```

**Expected output:**
```
Redis server started
Ready to accept connections
```

**Keep this terminal open!**

---

### Terminal 2: Backend Server (Main API - Port 3001)

```bash
cd backend
python3 -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:3001
INFO:     Application startup complete.
```

**Keep this terminal open!**

---

### Terminal 3: Backend Server (SkipOn Service - Port 3003)

```bash
cd backend
python3 -m uvicorn server:socket_app --host 0.0.0.0 --port 3003 --reload
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:3003
INFO:     Application startup complete.
```

**Keep this terminal open!**

---

### Terminal 4: Engage Server (Port 3002)

```bash
cd backend
node engage-server.js
```

**Expected output:**
```
🚀 ENGAGE Socket.IO Server Running
Port: 3002
Redis Status: ✅ Connected
```

**Keep this terminal open!**

---

### Terminal 5: Frontend (Expo Dev Server)

```bash
cd frontend
npm start
# OR
npm run start:clear  # If you have cache issues
```

**Expected output:**
```
Metro waiting on exp://192.168.x.x:8081
```

**Options:**
- Press `w` to open in web browser
- Press `i` to open iOS simulator (if on macOS)
- Press `a` to open Android emulator
- Scan QR code with Expo Go app on your phone

**Keep this terminal open!**

---

## ✅ Verification Checklist

After starting all services, verify they're running:

### Check Redis
```bash
redis-cli ping
# Should return: PONG
```

### Check Backend Servers
Open in browser or use curl:
- http://localhost:3001/docs (FastAPI docs)
- http://localhost:3003/docs (SkipOn API docs)
- http://localhost:3002/health (Engage server health)

### Check Frontend
- Open http://localhost:8081 in your browser
- Or use the Expo Go app to scan the QR code

---

## 🎯 Quick Start Script (Optional)

You can create a script to start all services at once:

### macOS/Linux: `start-all.sh`

```bash
#!/bin/bash

# Start Redis
redis-server &
sleep 2

# Start Backend on port 3001
cd backend
python3 -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload &
sleep 2

# Start Backend on port 3003
python3 -m uvicorn server:socket_app --host 0.0.0.0 --port 3003 --reload &
sleep 2

# Start Engage Server
node engage-server.js &
sleep 2

# Start Frontend
cd ../frontend
npm start
```

Make it executable:
```bash
chmod +x start-all.sh
./start-all.sh
```

### Windows: `start-all.bat`

```batch
@echo off
start "Redis" redis-server
timeout /t 2
start "Backend 3001" cmd /k "cd backend && python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload"
timeout /t 2
start "Backend 3003" cmd /k "cd backend && python -m uvicorn server:socket_app --host 0.0.0.0 --port 3003 --reload"
timeout /t 2
start "Engage" cmd /k "cd backend && node engage-server.js"
timeout /t 2
start "Frontend" cmd /k "cd frontend && npm start"
```

---

## 🔧 Troubleshooting

### Port Already in Use

If you get "port already in use" error:

**Find what's using the port:**
```bash
# macOS/Linux
lsof -i :3001
lsof -i :3002
lsof -i :3003

# Windows
netstat -ano | findstr :3001
netstat -ano | findstr :3002
netstat -ano | findstr :3003
```

**Kill the process:**
```bash
# macOS/Linux
kill -9 <PID>

# Windows
taskkill /PID <PID> /F
```

### Redis Connection Failed

1. Make sure Redis is running: `redis-cli ping`
2. Check Redis is on port 6379: `lsof -i :6379`
3. Restart Redis: `redis-server`

### MongoDB Connection Failed

1. Make sure MongoDB is running
2. Check your `MONGODB_URL` in `backend/.env`
3. For MongoDB Atlas, check your IP is whitelisted

### Frontend Not Loading

1. Clear Expo cache: `npm run start:clear`
2. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
3. Check if port 8081 is available

### Module Not Found Errors

1. Make sure you ran `npm install` in `frontend/`
2. Make sure you ran `pip install -r requirements.txt` in `backend/`
3. Check you're in the correct directory

---

## 📱 Accessing the App

### Web Browser
- Open: http://localhost:8081
- Or use the URL shown in the Expo terminal

### Mobile Device
1. Install **Expo Go** app from App Store/Play Store
2. Make sure your phone and computer are on the same WiFi
3. Scan the QR code shown in the Expo terminal
4. The app will load on your phone

---

## 🛑 Stopping All Services

### Manual Method
Press `Ctrl+C` in each terminal to stop each service.

### Kill All Processes (macOS/Linux)
```bash
# Kill Redis
redis-cli shutdown

# Kill all Node processes
pkill -f node

# Kill all Python processes
pkill -f uvicorn
```

### Kill All Processes (Windows)
```batch
taskkill /F /IM node.exe
taskkill /F /IM python.exe
taskkill /F /IM redis-server.exe
```

---

## 📊 Service Ports Summary

| Service | Port | Purpose |
|---------|------|---------|
| Redis | 6379 | Caching & real-time data |
| Backend (Main) | 3001 | Main API server |
| Backend (SkipOn) | 3003 | SkipOn matching service |
| Engage Server | 3002 | Engage/Socket.IO server |
| Frontend (Expo) | 8081 | Development server |

---

## 🆘 Need Help?

1. Check the console/terminal output for error messages
2. Verify all prerequisites are installed
3. Make sure all ports are available
4. Check that MongoDB and Redis are running
5. Review the `.env` file configuration

---

## ✅ Success Indicators

You'll know everything is working when:

1. ✅ Redis responds to `redis-cli ping` with `PONG`
2. ✅ Backend APIs are accessible at http://localhost:3001/docs
3. ✅ Engage server shows "✅ Connected" for Redis
4. ✅ Frontend loads in browser or Expo Go app
5. ✅ No connection errors in browser console

---

**That's it! Your project should now be running! 🎉**

