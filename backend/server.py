from fastapi import FastAPI, APIRouter, HTTPException, Header, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import socketio
import os
import logging
from pathlib import Path
from datetime import datetime, time, timedelta
from typing import Optional, List
import uuid
import asyncio

from models import (
    User, UserCreate, UserUpdate, LoginRequest, OTPVerify, GuestLogin, TokenResponse,
    ChatRoom, ChatMessage, EngageRoom, WatchRoom, WatchRoomCreate,
    SingRoom, GameRoom, ChessMove, Friend, FriendRequest, Report, ReportCreate,
    RoomStatus, FriendStatus, Gender, UserStatus, GameType
)
from auth import create_access_token, verify_token, get_current_user, otp_store

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'skip_on_db')]

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Socket.IO ASGI app
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ======================
# Socket.IO Connection Manager
# ======================
active_connections = {}  # {user_id: sid}
waiting_engage_rooms = {}  # {gender: [user_ids]}

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")
    await sio.emit('connected', {'sid': sid}, room=sid)

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")
    # Remove from active connections
    for user_id, socket_id in list(active_connections.items()):
        if socket_id == sid:
            del active_connections[user_id]
            # Update user online status
            await db.users.update_one(
                {"_id": user_id},
                {"$set": {"online": False}}
            )
            break

@sio.event
async def authenticate(sid, data):
    """Authenticate user and set online status"""
    token = data.get('token')
    if not token:
        await sio.emit('error', {'message': 'No token provided'}, room=sid)
        return
    
    user = await get_current_user(db, token)
    if not user:
        await sio.emit('error', {'message': 'Invalid token'}, room=sid)
        return
    
    user_id = user['_id']
    active_connections[user_id] = sid
    
    # Update user online status
    await db.users.update_one(
        {"_id": user_id},
        {"$set": {"online": True}}
    )
    
    await sio.emit('authenticated', {'user_id': user_id}, room=sid)
    logger.info(f"User {user_id} authenticated on socket {sid}")

# ======================
# Chat On Socket Events
# ======================
@sio.event
async def join_anonymous_chat(sid, data):
    """Join anonymous chat - find or create room"""
    # Find waiting room or create new one
    waiting_room = await db.chat_rooms.find_one({
        "status": RoomStatus.WAITING,
        "participants": {"$size": 1}
    })
    
    if waiting_room:
        # Join existing room
        room_id = waiting_room['_id']
        await db.chat_rooms.update_one(
            {"_id": room_id},
            {
                "$push": {"participants": sid},
                "$set": {"status": RoomStatus.ACTIVE}
            }
        )
        
        # Notify both users
        await sio.enter_room(sid, room_id)
        await sio.emit('chat_matched', {'room_id': room_id}, room=room_id)
    else:
        # Create new waiting room
        room_id = str(uuid.uuid4())
        await db.chat_rooms.insert_one({
            "_id": room_id,
            "participants": [sid],
            "status": RoomStatus.WAITING,
            "created_at": datetime.utcnow()
        })
        await sio.enter_room(sid, room_id)
        await sio.emit('chat_waiting', {'room_id': room_id}, room=sid)

@sio.event
async def send_chat_message(sid, data):
    """Send message in chat room"""
    room_id = data.get('room_id')
    message = data.get('message')
    
    if not room_id or not message:
        return
    
    # Save message
    message_id = str(uuid.uuid4())
    await db.chat_messages.insert_one({
        "_id": message_id,
        "room_id": room_id,
        "user_id": sid,
        "message": message,
        "timestamp": datetime.utcnow()
    })
    
    # Broadcast to room
    await sio.emit('chat_message', {
        'message_id': message_id,
        'message': message,
        'timestamp': datetime.utcnow().isoformat(),
        'is_self': False
    }, room=room_id, skip_sid=sid)

@sio.event
async def skip_chat(sid, data):
    """Skip current chat partner"""
    room_id = data.get('room_id')
    
    if room_id:
        # Mark room as completed
        await db.chat_rooms.update_one(
            {"_id": room_id},
            {"$set": {"status": RoomStatus.COMPLETED}}
        )
        
        # Notify other user
        await sio.emit('chat_partner_skipped', {}, room=room_id, skip_sid=sid)
        await sio.leave_room(sid, room_id)

# ======================
# Engage On Socket Events
# ======================
def is_engage_time_active(user_timezone_offset: int = 0) -> bool:
    """Check if current time is between 9 PM - 12 AM in user's timezone"""
    # Get user's local time
    utc_now = datetime.utcnow()
    user_time = utc_now + timedelta(hours=user_timezone_offset)
    
    current_hour = user_time.hour
    return 21 <= current_hour < 24  # 9 PM (21:00) to 12 AM (00:00)

@sio.event
async def join_engage(sid, data):
    """Join Engage On matching queue"""
    token = data.get('token')
    timezone_offset = data.get('timezone_offset', 0)  # Hours from UTC
    
    # Verify token
    user = await get_current_user(db, token)
    if not user:
        await sio.emit('error', {'message': 'Authentication required'}, room=sid)
        return
    
    # Check if it's active time
    if not is_engage_time_active(timezone_offset):
        await sio.emit('engage_time_restriction', {
            'message': 'Engage On is only active between 9 PM - 12 AM in your timezone'
        }, room=sid)
        return
    
    user_id = user['_id']
    user_gender = user['gender']
    
    # Opposite gender for matching
    target_gender = Gender.FEMALE if user_gender == Gender.MALE else Gender.MALE
    
    # Find waiting user of opposite gender
    waiting_room = await db.engage_rooms.find_one({
        "status": RoomStatus.WAITING,
        "user1_gender": target_gender
    })
    
    if waiting_room:
        # Match found!
        room_id = waiting_room['_id']
        await db.engage_rooms.update_one(
            {"_id": room_id},
            {
                "$set": {
                    "user2_id": user_id,
                    "user2_gender": user_gender,
                    "status": RoomStatus.ACTIVE,
                    "matched_at": datetime.utcnow()
                }
            }
        )
        
        # Get both users
        user1_id = waiting_room['user1_id']
        user1_sid = active_connections.get(user1_id)
        user2_sid = active_connections.get(user_id)
        
        if user1_sid:
            await sio.enter_room(user1_sid, room_id)
        if user2_sid:
            await sio.enter_room(user2_sid, room_id)
        
        # Notify both users
        await sio.emit('engage_matched', {'room_id': room_id}, room=room_id)
    else:
        # Create waiting room
        room_id = str(uuid.uuid4())
        await db.engage_rooms.insert_one({
            "_id": room_id,
            "user1_id": user_id,
            "user1_gender": user_gender,
            "status": RoomStatus.WAITING,
            "created_at": datetime.utcnow()
        })
        await sio.emit('engage_waiting', {'room_id': room_id}, room=sid)

@sio.event
async def send_engage_message(sid, data):
    """Send message in engage room"""
    room_id = data.get('room_id')
    message = data.get('message')
    token = data.get('token')
    
    user = await get_current_user(db, token)
    if not user:
        return
    
    # Save message
    message_id = str(uuid.uuid4())
    await db.engage_messages.insert_one({
        "_id": message_id,
        "room_id": room_id,
        "user_id": user['_id'],
        "message": message,
        "timestamp": datetime.utcnow()
    })
    
    # Broadcast to room
    await sio.emit('engage_message', {
        'message_id': message_id,
        'message': message,
        'sender_name': user['name'],
        'timestamp': datetime.utcnow().isoformat()
    }, room=room_id)

@sio.event
async def skip_engage(sid, data):
    """Skip current engage partner"""
    room_id = data.get('room_id')
    
    if room_id:
        await db.engage_rooms.update_one(
            {"_id": room_id},
            {"$set": {"status": RoomStatus.COMPLETED}}
        )
        
        await sio.emit('engage_partner_skipped', {}, room=room_id, skip_sid=sid)
        await sio.leave_room(sid, room_id)

# ======================
# Watch Along Socket Events
# ======================
@sio.event
async def create_watch_room(sid, data):
    """Create a watch along room"""
    token = data.get('token')
    video_url = data.get('video_url')
    
    user = await get_current_user(db, token)
    if not user:
        await sio.emit('error', {'message': 'Authentication required'}, room=sid)
        return
    
    room_id = str(uuid.uuid4())
    await db.watch_rooms.insert_one({
        "_id": room_id,
        "host_id": user['_id'],
        "participants": [user['_id']],
        "video_url": video_url,
        "current_time": 0.0,
        "is_playing": False,
        "created_at": datetime.utcnow()
    })
    
    await sio.enter_room(sid, f"watch_{room_id}")
    await sio.emit('watch_room_created', {'room_id': room_id}, room=sid)

@sio.event
async def join_watch_room(sid, data):
    """Join a watch along room"""
    token = data.get('token')
    room_id = data.get('room_id')
    
    user = await get_current_user(db, token)
    if not user:
        return
    
    # Add user to room
    await db.watch_rooms.update_one(
        {"_id": room_id},
        {"$addToSet": {"participants": user['_id']}}
    )
    
    await sio.enter_room(sid, f"watch_{room_id}")
    
    # Get room state
    room = await db.watch_rooms.find_one({"_id": room_id})
    await sio.emit('watch_room_joined', {
        'room_id': room_id,
        'video_url': room['video_url'],
        'current_time': room['current_time'],
        'is_playing': room['is_playing']
    }, room=sid)
    
    # Notify others
    await sio.emit('watch_user_joined', {'user_name': user['name']}, room=f"watch_{room_id}", skip_sid=sid)

@sio.event
async def watch_control(sid, data):
    """Control video playback (play, pause, seek)"""
    room_id = data.get('room_id')
    action = data.get('action')  # 'play', 'pause', 'seek'
    current_time = data.get('current_time', 0.0)
    
    # Update room state
    update_data = {"current_time": current_time}
    if action == 'play':
        update_data['is_playing'] = True
    elif action == 'pause':
        update_data['is_playing'] = False
    
    await db.watch_rooms.update_one(
        {"_id": room_id},
        {"$set": update_data}
    )
    
    # Broadcast to all participants
    await sio.emit('watch_sync', {
        'action': action,
        'current_time': current_time
    }, room=f"watch_{room_id}", skip_sid=sid)

# ======================
# Game (Chess) Socket Events
# ======================
@sio.event
async def create_game_room(sid, data):
    """Create a chess game room"""
    token = data.get('token')
    
    user = await get_current_user(db, token)
    if not user:
        return
    
    room_id = str(uuid.uuid4())
    # Initial chess position in simple format
    initial_board = {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "moves": []
    }
    
    await db.game_rooms.insert_one({
        "_id": room_id,
        "game_type": GameType.CHESS,
        "host_id": user['_id'],
        "participants": [user['_id']],
        "game_state": initial_board,
        "current_turn": user['_id'],
        "status": RoomStatus.WAITING,
        "created_at": datetime.utcnow()
    })
    
    await sio.enter_room(sid, f"game_{room_id}")
    await sio.emit('game_room_created', {'room_id': room_id}, room=sid)

@sio.event
async def join_game_room(sid, data):
    """Join a chess game room"""
    token = data.get('token')
    room_id = data.get('room_id')
    
    user = await get_current_user(db, token)
    if not user:
        return
    
    room = await db.game_rooms.find_one({"_id": room_id})
    if not room or len(room['participants']) >= 2:
        await sio.emit('error', {'message': 'Room full or not found'}, room=sid)
        return
    
    # Add opponent
    await db.game_rooms.update_one(
        {"_id": room_id},
        {
            "$set": {
                "opponent_id": user['_id'],
                "status": RoomStatus.ACTIVE
            },
            "$addToSet": {"participants": user['_id']}
        }
    )
    
    await sio.enter_room(sid, f"game_{room_id}")
    
    # Send game state
    room = await db.game_rooms.find_one({"_id": room_id})
    await sio.emit('game_started', {
        'room_id': room_id,
        'game_state': room['game_state'],
        'your_color': 'black',
        'current_turn': room['current_turn']
    }, room=sid)
    
    # Notify host
    host_sid = active_connections.get(room['host_id'])
    if host_sid:
        await sio.emit('game_opponent_joined', {
            'opponent_name': user['name']
        }, room=host_sid)

@sio.event
async def make_chess_move(sid, data):
    """Make a chess move"""
    token = data.get('token')
    room_id = data.get('room_id')
    move = data.get('move')  # {from: 'e2', to: 'e4'}
    
    user = await get_current_user(db, token)
    if not user:
        return
    
    room = await db.game_rooms.find_one({"_id": room_id})
    if not room or room['current_turn'] != user['_id']:
        await sio.emit('error', {'message': 'Not your turn'}, room=sid)
        return
    
    # Update game state (simplified - real validation would be more complex)
    game_state = room['game_state']
    game_state['moves'].append(move)
    
    # Switch turns
    next_turn = room['opponent_id'] if user['_id'] == room['host_id'] else room['host_id']
    
    await db.game_rooms.update_one(
        {"_id": room_id},
        {
            "$set": {
                "game_state": game_state,
                "current_turn": next_turn
            }
        }
    )
    
    # Broadcast move
    await sio.emit('chess_move', {
        'move': move,
        'game_state': game_state,
        'next_turn': next_turn
    }, room=f"game_{room_id}")

# ======================
# REST API Routes
# ======================

@api_router.get("/")
async def root():
    return {"message": "Skip On API", "version": "1.0.0"}

# Auth Routes
@api_router.post("/auth/login", response_model=dict)
async def login(request: LoginRequest):
    """Send OTP to email"""
    otp = otp_store.generate_otp(request.email)
    
    # In production, send email here
    # For now, just log it
    logger.info(f"OTP for {request.email}: {otp}")
    
    return {"message": "OTP sent to email", "otp": otp}  # Remove otp in production

@api_router.post("/auth/verify-otp", response_model=TokenResponse)
async def verify_otp(request: OTPVerify):
    """Verify OTP and return token"""
    if not otp_store.verify_otp(request.email, request.otp):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # Find or create user
    user = await db.users.find_one({"email": request.email})
    
    if not user:
        # Create new user - they'll complete profile later
        user_id = str(uuid.uuid4())
        user = {
            "_id": user_id,
            "email": request.email,
            "name": "",
            "city": "",
            "gender": Gender.OTHER,
            "status": UserStatus.ACTIVE,
            "is_guest": False,
            "created_at": datetime.utcnow(),
            "online": False
        }
        await db.users.insert_one(user)
    
    # Create token
    token = create_access_token({"sub": user['_id']})
    
    return TokenResponse(
        access_token=token,
        user=User(**user)
    )

@api_router.post("/auth/guest-login", response_model=TokenResponse)
async def guest_login(request: GuestLogin):
    """Login as guest"""
    # Check if guest exists
    user = await db.users.find_one({"guest_uuid": request.guest_uuid})
    
    if not user:
        # Create guest user
        user_id = str(uuid.uuid4())
        user = {
            "_id": user_id,
            "guest_uuid": request.guest_uuid,
            "name": request.name,
            "city": request.city,
            "gender": request.gender,
            "status": UserStatus.ACTIVE,
            "is_guest": True,
            "created_at": datetime.utcnow(),
            "online": False
        }
        await db.users.insert_one(user)
    
    # Create token
    token = create_access_token({"sub": user['_id']})
    
    return TokenResponse(
        access_token=token,
        user=User(**user)
    )

@api_router.get("/auth/me", response_model=User)
async def get_me(authorization: Optional[str] = Header(None)):
    """Get current user"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ")[1]
    user = await get_current_user(db, token)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return User(**user)

# Profile Routes
@api_router.put("/profile", response_model=User)
async def update_profile(update: UserUpdate, authorization: Optional[str] = Header(None)):
    """Update user profile"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ")[1]
    user = await get_current_user(db, token)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Update user
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    
    if update_data:
        await db.users.update_one(
            {"_id": user['_id']},
            {"$set": update_data}
        )
    
    # Get updated user
    updated_user = await db.users.find_one({"_id": user['_id']})
    return User(**updated_user)

# Friends Routes
@api_router.post("/friends/request")
async def send_friend_request(request: FriendRequest, authorization: Optional[str] = Header(None)):
    """Send friend request"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ")[1]
    user = await get_current_user(db, token)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Check if already friends
    existing = await db.friends.find_one({
        "user_id": user['_id'],
        "friend_id": request.friend_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Friend request already exists")
    
    # Create friend request
    friend_id = str(uuid.uuid4())
    await db.friends.insert_one({
        "_id": friend_id,
        "user_id": user['_id'],
        "friend_id": request.friend_id,
        "status": FriendStatus.PENDING,
        "created_at": datetime.utcnow()
    })
    
    return {"message": "Friend request sent"}

@api_router.get("/friends")
async def get_friends(authorization: Optional[str] = Header(None)):
    """Get friends list"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ")[1]
    user = await get_current_user(db, token)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    friends = await db.friends.find({
        "user_id": user['_id'],
        "status": FriendStatus.ACCEPTED
    }).to_list(1000)
    
    return {"friends": friends}

# Report Routes
@api_router.post("/report")
async def report_user(report: ReportCreate, authorization: Optional[str] = Header(None)):
    """Report a user"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ")[1]
    user = await get_current_user(db, token)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    report_id = str(uuid.uuid4())
    await db.reports.insert_one({
        "_id": report_id,
        "reporter_id": user['_id'],
        "reported_id": report.reported_id,
        "reason": report.reason,
        "timestamp": datetime.utcnow()
    })
    
    return {"message": "Report submitted"}

# Watch Rooms
@api_router.get("/watch/rooms")
async def get_watch_rooms(authorization: Optional[str] = Header(None)):
    """Get active watch rooms"""
    rooms = await db.watch_rooms.find({}).to_list(100)
    return {"rooms": rooms}

# Game Rooms
@api_router.get("/game/rooms")
async def get_game_rooms(authorization: Optional[str] = Header(None)):
    """Get active game rooms"""
    rooms = await db.game_rooms.find({
        "status": RoomStatus.WAITING
    }).to_list(100)
    return {"rooms": rooms}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Export socket_app for uvicorn
# Run with: uvicorn server:socket_app --host 0.0.0.0 --port 8001
