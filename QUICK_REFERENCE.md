# ⚡ Quick Reference - Terminal Commands

## 🚀 Start All Services (5 Terminals Required)

### Terminal 1: Redis
```bash
redis-server
# OR
cd backend && ./start-redis.sh
```

### Terminal 2: Backend (Port 3001)
```bash
cd backend
python3 -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

### Terminal 3: Backend (Port 3003)
```bash
cd backend
python3 -m uvicorn server:socket_app --host 0.0.0.0 --port 3003 --reload
```

### Terminal 4: Engage Server (Port 3002)
```bash
cd backend
node engage-server.js
```

### Terminal 5: Frontend
```bash
cd frontend
npm start
# Press 'w' for web, 'i' for iOS, 'a' for Android
```

---

## ✅ Verify Services Are Running

```bash
# Check Redis
redis-cli ping
# Should return: PONG

# Check ports
lsof -i :3001  # Backend main
lsof -i :3002  # Engage server
lsof -i :3003  # Backend SkipOn
lsof -i :6379  # Redis
lsof -i :8081  # Frontend
```

---

## 🛑 Stop All Services

Press `Ctrl+C` in each terminal, OR:

```bash
# Kill all
pkill -f redis-server
pkill -f uvicorn
pkill -f node
```

---

## 📋 First Time Setup

1. **Install dependencies:**
   ```bash
   cd frontend && npm install && cd ..
   cd backend && pip3 install -r requirements.txt && cd ..
   ```

2. **Create `.env` file in `backend/`:**
   ```env
   MONGODB_URL=mongodb://localhost:27017/gingr
   REDIS_HOST=localhost
   REDIS_PORT=6379
   JWT_SECRET=your-secret-key-here
   ```

3. **Start MongoDB** (if using local MongoDB)

4. **Start all 5 terminals** (see above)

---

## 🔗 Access Points

- **Frontend (Web):** http://localhost:8081
- **Backend API Docs:** http://localhost:3001/docs
- **Engage Health:** http://localhost:3002/health

---

## ⚠️ Common Issues

**Port in use?**
```bash
lsof -i :PORT_NUMBER  # Find process
kill -9 PID           # Kill it
```

**Module not found?**
```bash
# Frontend
cd frontend && rm -rf node_modules && npm install

# Backend
cd backend && pip3 install -r requirements.txt
```

**Redis connection failed?**
```bash
redis-cli ping  # Test connection
redis-server     # Start Redis
```

---

**See `SETUP_GUIDE.md` for detailed instructions!**

