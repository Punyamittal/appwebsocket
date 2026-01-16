#!/bin/bash
# Start All Services for Skip On App (IP Address Version)
# This script ensures all required services are running on your IP

IP_ADDRESS="172.20.139.243"

echo "🚀 Starting Skip On Services on IP: $IP_ADDRESS"
echo ""

# Kill any existing services
echo "🛑 Stopping existing services..."
pkill -f "uvicorn|node.*engage|expo" 2>/dev/null || true
sleep 2

# Start Redis (check if running)
echo "1️⃣ Checking Redis..."
if ! redis-cli ping >/dev/null 2>&1; then
    echo "   ❌ Redis not running - starting with Docker..."
    docker run -d -p 6379:6379 --name redis-skipon redis:latest 2>/dev/null || true
    sleep 3
else
    echo "   ✅ Redis is running"
fi

# Start FastAPI backend (port 3001)
echo "2️⃣ Starting FastAPI backend (port 3001)..."
cd backend
python3 -m uvicorn server:socket_app --host $IP_ADDRESS --port 3001 --reload &
BACKEND_PID=$!
sleep 3

# Start Socket.IO server (port 3003)
echo "3️⃣ Starting Socket.IO server (port 3003)..."
python3 -m uvicorn server:socket_app --host $IP_ADDRESS --port 3003 --reload &
SOCKETIO_PID=$!
sleep 3

# Start Engage server (port 3002)
echo "4️⃣ Starting Engage server (port 3002)..."
npm run start:engage &
ENGAGE_PID=$!
sleep 3

# Start Frontend
echo "5️⃣ Starting Frontend..."
cd ../frontend
npx expo start --clear &
FRONTEND_PID=$!

echo ""
echo "✅ All services started!"
echo ""
echo "📊 Service Status:"
echo "- FastAPI (REST + Socket.IO): http://$IP_ADDRESS:3001"
echo "- FastAPI (Socket.IO only): http://$IP_ADDRESS:3003"  
echo "- Engage Server: http://$IP_ADDRESS:3002"
echo "- Frontend: http://$IP_ADDRESS:8081"
echo ""
echo "📱 Access from phone: http://$IP_ADDRESS:8081"
echo ""
echo "🔍 Test endpoints:"
echo "curl http://$IP_ADDRESS:3001/api/"
echo "curl http://$IP_ADDRESS:3002/health"
echo ""

# Save PIDs for cleanup
echo "BACKEND_PID=$BACKEND_PID" > /tmp/skipon_pids.txt
echo "SOCKETIO_PID=$SOCKETIO_PID" >> /tmp/skipon_pids.txt
echo "ENGAGE_PID=$ENGAGE_PID" >> /tmp/skipon_pids.txt
echo "FRONTEND_PID=$FRONTEND_PID" >> /tmp/skipon_pids.txt

echo "💾 PIDs saved to /tmp/skipon_pids.txt"
echo "🛑 To stop all services: kill \$(cat /tmp/skipon_pids.txt | tr '\n' ' ')"
