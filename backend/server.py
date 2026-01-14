from fastapi import FastAPI, APIRouter, HTTPException, Header, WebSocket, WebSocketDisconnect, Body
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
import time as time_module

from models import (
    User, UserCreate, UserUpdate, LoginRequest, OTPVerify, GuestLogin, TokenResponse,
    ChatRoom, ChatMessage, EngageRoom, WatchRoom, WatchRoomCreate,
    SingRoom, GameRoom, ChessMove, Friend, FriendRequest, Report, ReportCreate,
    RoomStatus, FriendStatus, Gender, UserStatus, GameType,
    SkipMatchRequest, SkipLeaveRequest
)
from auth import create_access_token, verify_token, get_current_user, otp_store
from db_config import init_db, close_db, get_db, get_client
from db_indexes import create_indexes
from query_optimizer import QueryOptimizer
from redis_service import redis_queue_service
from video_call_service import (
    get_video_call, create_video_call, update_call_status, end_video_call
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging FIRST (before using logger)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection with pooling (initialized on startup)
client = None
db = None

def ensure_db():
    """Ensure database is initialized, raise error if not."""
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Database not initialized. Please wait for server startup."
        )
    return db

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# Create the main app
app = FastAPI()

# Add CORS middleware EARLY (before routes) - CRITICAL for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],  # Allow all origins in development
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Socket.IO ASGI app (will be created after routes are defined)
# socket_app will be created at the end after all routes are registered

# Logger is already configured above (before MongoDB connection)

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
    if not db:
        await sio.emit('error', {'message': 'Database not available'}, room=sid)
        return
        
    token = data.get('token')
    if not token:
        await sio.emit('error', {'message': 'No token provided'}, room=sid)
        return
    
    try:
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
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        await sio.emit('error', {'message': 'Authentication failed'}, room=sid)

# ======================
# Chat On Socket Events
# ======================
@sio.event
async def join_anonymous_chat(sid, data):
    """Join anonymous chat - find or create room"""
    if not db:
        await sio.emit('error', {'message': 'Database not available'}, room=sid)
        return
    
    # Find waiting room or create new one (optimized query)
    waiting_room = await QueryOptimizer.find_waiting_chat_room(db.chat_rooms)
    
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
    if not db:
        return
    
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
    
    # Find waiting user of opposite gender (optimized query)
    waiting_room = await QueryOptimizer.find_waiting_engage_room(
        db.engage_rooms,
        target_gender
    )
    
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
    ensure_db()  # Ensure database is initialized
    
    if not otp_store.verify_otp(request.email, request.otp):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # Find or create user (optimized query)
    user = await QueryOptimizer.find_user_by_email(db.users, request.email)
    
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
    ensure_db()  # Ensure database is initialized
    
    # Check if guest exists (optimized query)
    user = await db.users.find_one(
        {"guest_uuid": request.guest_uuid},
        projection=QueryOptimizer.get_user_projection()
    )
    
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
    
    # Get updated user (optimized query)
    updated_user = await QueryOptimizer.find_user_by_id(
        db.users,
        user['_id'],
        include_avatar=True  # Include avatar in profile updates
    )
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
    
    # Get friends list (optimized query)
    friends = await QueryOptimizer.get_friends_list(
        db.friends,
        user['_id'],
        status=FriendStatus.ACCEPTED
    )
    
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
    """Get active watch rooms (optimized query)"""
    rooms = await QueryOptimizer.get_active_watch_rooms(db.watch_rooms)
    return {"rooms": rooms}

# Game Rooms
@api_router.get("/game/rooms")
async def get_game_rooms(authorization: Optional[str] = Header(None)):
    """Get active game rooms (optimized query)"""
    rooms = await QueryOptimizer.get_waiting_game_rooms(
        db.game_rooms,
        limit=100
    )
    return {"rooms": rooms}

# ======================
# Skip On Matchmaking (REST API)
# ======================

# Redis-based matchmaking queue (with in-memory fallback)
# Note: All queue operations now use redis_queue_service
# The service automatically falls back to in-memory if Redis is unavailable

@api_router.post("/skip/match")
async def skip_match(
    request: Optional[SkipMatchRequest] = Body(None),
    authorization: Optional[str] = Header(None)
):
    """
    Join matchmaking queue or get matched immediately.
    Works for both authenticated and guest users.
    
    Request body (optional): { "guestId": "..." } for guest users
    
    Returns:
    - If matched: { status: "matched", roomId, partnerId, isPartnerGuest }
    - If queued: { status: "searching" }
    """
    logger.info("🔍 Skip On: /skip/match endpoint called")
    logger.info(f"🔍 Skip On: Request body: {request}")
    logger.info(f"🔍 Skip On: Authorization header: {authorization[:20] + '...' if authorization and len(authorization) > 20 else authorization}")
    
    # Get user ID and gender (authenticated or guest)
    userId = None
    isGuest = False
    userGender = None
    
    # Get gender from request body (required for matching)
    if request and request.gender:
        userGender = request.gender
        logger.info(f"🔍 Skip On: Gender from request: {userGender}")
    else:
        logger.warning("🔍 Skip On: No gender provided in request - gender-based matching requires gender")
        # Default to OTHER if not provided (for backward compatibility)
        userGender = Gender.OTHER
    
    if authorization and authorization.startswith("Bearer "):
        # Authenticated user
        token = authorization.split(" ")[1]
        # Skip database lookup for demo guest tokens (they start with "demo_guest_token_")
        if token.startswith("demo_guest_token_"):
            logger.info("🔍 Skip On: Detected demo guest token, skipping database lookup")
            # Don't set userId here - let it fall through to guestId check
        else:
            # Real authenticated user - Extract user ID from JWT token (works without MongoDB)
            try:
                payload = verify_token(token)
                if payload:
                    token_user_id = payload.get("sub")
                    if token_user_id:
                        userId = token_user_id
                        isGuest = False  # Authenticated users are not guests
                        logger.info(f"🔍 Skip On: Authenticated user ID from token: {userId}")
                    else:
                        logger.warning("🔍 Skip On: Token payload missing 'sub' field")
                else:
                    logger.warning("🔍 Skip On: Invalid token, treating as guest")
            except Exception as e:
                logger.error(f"🔍 Skip On: Error decoding token: {e}")
                # Continue to guestId check if token decode fails
    
    # If no auth token or invalid, check for guestId in request body
    if not userId:
        logger.info("🔍 Skip On: No authenticated user, checking for guestId")
        if request and request.guestId:
            userId = request.guestId
            isGuest = True
            logger.info(f"🔍 Skip On: Using guestId from request: {userId}")
        elif request is None or (request and not request.guestId):
            # Empty body or no guestId - DON'T generate temp_guest IDs
            # This causes fake matches. Require proper guestId or authentication.
            logger.error("🔍 Skip On: No userId, no guestId, and no valid token - cannot match")
            raise HTTPException(
                status_code=400, 
                detail="Authentication required or guestId must be provided. Cannot create temporary guest IDs for matching."
            )
        else:
            logger.error("🔍 Skip On: No userId and no guestId provided")
            raise HTTPException(status_code=400, detail="Authentication required or guestId must be provided")
    
    logger.info(f"🔍 Skip On: Processing match for userId: {userId}, isGuest: {isGuest}")
    
    if not userId:
        logger.error("🔍 Skip On: No userId after processing, returning error")
        raise HTTPException(status_code=400, detail="Unable to determine user ID")
    
    # CRITICAL: Check if user is already in a room FIRST (before checking queue)
    # This handles the case where:
    # - User A matches with User B and creates room
    # - User B calls match() (via polling) and should find they're already in that room
    # - Both users should get the SAME roomId
    existing_room_id = await redis_queue_service.get_user_room(userId)
    if existing_room_id:
        room = await redis_queue_service.get_room(existing_room_id)
        if room:
            user1 = room.get('user1Id')
            user2 = room.get('user2Id')
            
            # CRITICAL: Only return matched if BOTH users exist and are different
            if user1 and user2 and user1 != user2:
                # Both users exist - get partner ID
                partnerId = user1 if user1 != userId else user2
                
                # CRITICAL: Verify partner is different from current user AND partnerId is valid
                if partnerId and partnerId != userId and partnerId.strip() != '':
                    partnerIsGuest = room.get('user1IsGuest', False) if user1 != userId else room.get('user2IsGuest', False)
                    logger.info(f"✅ Skip On: User {userId} already in matched room {existing_room_id} with partner {partnerId}")
                    logger.info(f"✅ Skip On: Returning matched response for existing room")
                    
                    return {
                        "status": "matched",
                        "roomId": existing_room_id,
                        "partnerId": partnerId,  # MUST be present and valid
                        "isPartnerGuest": partnerIsGuest
                    }
                else:
                    logger.error(f"❌ Skip On: Invalid partnerId ({partnerId}) in existing room {existing_room_id} for user {userId}")
                    await redis_queue_service.delete_room(existing_room_id)
                    return {"status": "searching"}
            else:
                # Single-user room or invalid state detected! Clean it up and continue searching
                logger.warning(f"⚠️ Skip On: User {userId} in single-user or invalid room {existing_room_id} (user1: {user1}, user2: {user2}), cleaning up")
                await redis_queue_service.delete_room(existing_room_id)
                # Continue to normal matchmaking flow
        else:
            # Room doesn't exist, already cleaned up
            pass
    
    # CRITICAL: First, ensure current user is in queue (if not already)
    # This ensures that when another user searches, they can find us
    alreadyInQueue = await redis_queue_service.is_user_in_queue(userId)
    if not alreadyInQueue:
        timestamp = datetime.utcnow().isoformat()
        await redis_queue_service.add_to_queue(userId, isGuest, userGender, timestamp)
        logger.info(f"🔍 Skip On: User {userId} (gender: {userGender}) added to queue")
    
    queue_length = await redis_queue_service.get_queue_length()
    logger.info(f"🔍 Skip On: Queue length: {queue_length}")
    logger.info(f"🔍 Skip On: Current user: {userId} (gender: {userGender})")
    logger.info(f"🔍 Skip On: Current user isGuest: {isGuest}")
    logger.info(f"🔍 Skip On: Redis connected: {redis_queue_service.is_connected}, Fallback mode: {redis_queue_service.fallback_mode}")
    
    # Get compatible partners from Redis (automatically filters by gender compatibility)
    # This will find users who are already in the queue
    available_partners = await redis_queue_service.get_compatible_partners(userId, userGender)
    
    logger.info(f"🔍 Skip On: Available compatible partners: {len(available_partners)} (user gender: {userGender})")
    if available_partners:
        logger.info(f"🔍 Skip On: Compatible partner IDs: {[p.get('userId') for p in available_partners]}")
        logger.info(f"🔍 Skip On: Partner details: {available_partners}")
    else:
        logger.info(f"🔍 Skip On: No compatible partners found in queue (user gender: {userGender})")
        logger.info(f"🔍 Skip On: Queue length: {queue_length}, User in queue: {alreadyInQueue}")
    
    if len(available_partners) > 0:
        # Match with first available partner
        partner = available_partners[0]
        partnerId = partner.get('userId')
        partnerIsGuest = partner.get('isGuest', False)
        partnerGender_str = partner.get('gender', 'other')
        
        # CRITICAL: Prevent matching with temp_guest IDs (they're fake, not real users)
        if partnerId and (partnerId.startswith('temp_guest_') or userId.startswith('temp_guest_')):
            logger.warning(f"⚠️ Skip On: Attempted to match with temp_guest ID (fake user), skipping")
            logger.warning(f"⚠️ Skip On: partnerId: {partnerId}, userId: {userId}")
            # Don't create room, just return searching
            return {
                "status": "searching"
            }
        
        if not partnerId:
            logger.warning(f"⚠️ Skip On: Partner data missing userId, skipping")
            return {"status": "searching"}
        
        logger.info(f"🔍 Skip On: Matching {userId} with {partnerId}")
        
        # Safety check: prevent matching with yourself
        if partnerId == userId:
            logger.warning(f"⚠️ Skip On: Attempted to match user {userId} with themselves, skipping")
            return {"status": "searching"}
        
        # CRITICAL RACE CONDITION FIX: Use atomic "claim partner" operation
        # Try to atomically claim the partner before matching
        # This ensures only one user can match with a partner at a time
        partner_claimed = await redis_queue_service.claim_partner_for_matching(userId, partnerId)
        if not partner_claimed:
            logger.warning(f"⚠️ Skip On: Partner {partnerId} was already claimed by another request, skipping match")
            # Partner was already matched by someone else - continue searching
            if not await redis_queue_service.is_user_in_queue(userId):
                timestamp = datetime.utcnow().isoformat()
                await redis_queue_service.add_to_queue(userId, isGuest, userGender, timestamp)
            return {"status": "searching"}
        
        # Partner was successfully claimed - check if they're already in a room with us
        partner_room = await redis_queue_service.get_user_room(partnerId)
        if partner_room:
            partner_room_data = await redis_queue_service.get_room(partner_room)
            if partner_room_data:
                room_user1 = partner_room_data.get('user1Id')
                room_user2 = partner_room_data.get('user2Id')
                # If partner is in a room with us, return that room
                if (room_user1 == userId or room_user2 == userId) and room_user1 and room_user2:
                    # Release the claim since we're using existing room
                    await redis_queue_service.release_partner_claim(partnerId)
                    if not partnerId or partnerId == userId or partnerId.strip() == '':
                        logger.error(f"❌ Skip On: Invalid partnerId ({partnerId}) when partner already in room {partner_room}")
                        return {"status": "searching"}
                    
                    logger.info(f"✅ Skip On: Partner {partnerId} already matched with us in room {partner_room}")
                    partnerIsGuest = partner_room_data.get('user1IsGuest', False) if room_user1 != userId else partner_room_data.get('user2IsGuest', False)
                    return {
                        "status": "matched",
                        "roomId": partner_room,
                        "partnerId": partnerId,
                        "isPartnerGuest": partnerIsGuest
                    }
                else:
                    # Partner matched with someone else - release claim and skip
                    await redis_queue_service.release_partner_claim(partnerId)
                    logger.warning(f"⚠️ Skip On: Partner {partnerId} already matched with someone else, skipping")
                    if not await redis_queue_service.is_user_in_queue(userId):
                        timestamp = datetime.utcnow().isoformat()
                        await redis_queue_service.add_to_queue(userId, isGuest, userGender, timestamp)
                    return {"status": "searching"}
        
        # Remove current user from queue (partner is already removed by claim operation)
        await redis_queue_service.remove_from_queue(userId)
        
        # CRITICAL: Double-check partner is not already in a different room
        # This prevents creating duplicate rooms if partner was matched by another request
        partner_room_check = await redis_queue_service.get_user_room(partnerId)
        if partner_room_check:
            # Partner is already in a room - check if it's with us
            partner_room_data = await redis_queue_service.get_room(partner_room_check)
            if partner_room_data:
                room_user1 = partner_room_data.get('user1Id')
                room_user2 = partner_room_data.get('user2Id')
                if (room_user1 == userId or room_user2 == userId) and room_user1 and room_user2:
                    # Partner is in a room with us - use that room!
                    logger.info(f"✅ Skip On: Partner {partnerId} already in room {partner_room_check} with us, using existing room")
                    await redis_queue_service.release_partner_claim(partnerId)
                    partnerIsGuest = partner_room_data.get('user1IsGuest', False) if room_user1 != userId else partner_room_data.get('user2IsGuest', False)
                    return {
                        "status": "matched",
                        "roomId": partner_room_check,
                        "partnerId": partnerId,
                        "isPartnerGuest": partnerIsGuest
                    }
                else:
                    # Partner is in a room with someone else
                    logger.warning(f"⚠️ Skip On: Partner {partnerId} is already in room {partner_room_check} with someone else, releasing claim")
                    await redis_queue_service.release_partner_claim(partnerId)
                    timestamp = datetime.utcnow().isoformat()
                    await redis_queue_service.add_to_queue(userId, isGuest, userGender, timestamp)
                    return {"status": "searching"}
        
        # Create room (only when both users are ready - no single-user rooms)
        roomId = f"skip_{uuid.uuid4()}"
        partnerGender = Gender(partnerGender_str) if isinstance(partnerGender_str, str) else partnerGender_str
        
        # CRITICAL: Create room atomically - both users must be added together
        room_created = await redis_queue_service.create_room(
            roomId=roomId,
            user1Id=partnerId,
            user2Id=userId,
            user1IsGuest=partnerIsGuest,
            user2IsGuest=isGuest,
            user1Gender=partnerGender,
            user2Gender=userGender
        )
        
        if not room_created:
            logger.error(f"❌ Skip On: Failed to create room {roomId}, releasing claim and re-adding users to queue")
            await redis_queue_service.release_partner_claim(partnerId)
            # Re-add both users to queue if room creation failed
            timestamp = datetime.utcnow().isoformat()
            await redis_queue_service.add_to_queue(userId, isGuest, userGender, timestamp)
            await redis_queue_service.add_to_queue(partnerId, partnerIsGuest, partnerGender, timestamp)
            return {"status": "searching"}
        
        # Room created successfully - release the claim
        await redis_queue_service.release_partner_claim(partnerId)
        
        # CRITICAL: Verify both users are mapped to the same room
        user_room = await redis_queue_service.get_user_room(userId)
        partner_room = await redis_queue_service.get_user_room(partnerId)
        if user_room != roomId or partner_room != roomId:
            logger.error(f"❌ Skip On: Room mapping mismatch! User {userId} -> {user_room}, Partner {partnerId} -> {partner_room}, Expected: {roomId}")
            # Fix the mapping by re-creating the room mappings
            if not redis_queue_service.fallback_mode and redis_queue_service.redis_client:
                try:
                    if user_room != roomId:
                        await redis_queue_service.redis_client.setex(f"skipon:user_room:{userId}", 3600, roomId)
                    if partner_room != roomId:
                        await redis_queue_service.redis_client.setex(f"skipon:user_room:{partnerId}", 3600, roomId)
                    logger.info(f"✅ Skip On: Fixed room mappings")
                except Exception as e:
                    logger.error(f"❌ Skip On: Error fixing room mappings: {e}")
            elif redis_queue_service.fallback_mode:
                # In fallback mode, fix in-memory mappings
                redis_queue_service.fallback_user_to_room[userId] = roomId
                redis_queue_service.fallback_user_to_room[partnerId] = roomId
                logger.info(f"✅ Skip On: Fixed room mappings (fallback mode)")
        
        logger.info(f"✅ Skip On match: Room {roomId} - {partnerId} + {userId}")
        logger.info(f"✅ Skip On: User {userId} mapped to room {await redis_queue_service.get_user_room(userId)}")
        logger.info(f"✅ Skip On: Partner {partnerId} mapped to room {await redis_queue_service.get_user_room(partnerId)}")
        
        # CRITICAL: Verify room was created correctly with BOTH users before returning matched
        verify_room = await redis_queue_service.get_room(roomId)
        if not verify_room:
            logger.error(f"❌ Skip On: Room {roomId} was not created! Re-adding users to queue")
            timestamp = datetime.utcnow().isoformat()
            await redis_queue_service.add_to_queue(userId, isGuest, userGender, timestamp)
            await redis_queue_service.add_to_queue(partnerId, partnerIsGuest, partnerGender, timestamp)
            return {"status": "searching"}
        
        verify_user1 = verify_room.get('user1Id')
        verify_user2 = verify_room.get('user2Id')
        if not verify_user1 or not verify_user2 or verify_user1 == verify_user2:
            logger.error(f"❌ Skip On: Room {roomId} is invalid (user1: {verify_user1}, user2: {verify_user2})! Re-adding users to queue")
            await redis_queue_service.delete_room(roomId)
            timestamp = datetime.utcnow().isoformat()
            await redis_queue_service.add_to_queue(userId, isGuest, userGender, timestamp)
            await redis_queue_service.add_to_queue(partnerId, partnerIsGuest, partnerGender, timestamp)
            return {"status": "searching"}
        
        # CRITICAL: Only return "matched" if room has BOTH users confirmed
        # DOUBLE-CHECK: Verify partnerId is valid and different from userId
        if not partnerId or partnerId == userId or partnerId.strip() == '':
            logger.error(f"❌ Skip On: Invalid partnerId ({partnerId}) for user {userId}! Re-adding to queue")
            await redis_queue_service.delete_room(roomId)
            timestamp = datetime.utcnow().isoformat()
            await redis_queue_service.add_to_queue(userId, isGuest, userGender, timestamp)
            actual_partner = verify_user1 if verify_user1 != userId else verify_user2
            if actual_partner:
                await redis_queue_service.add_to_queue(actual_partner, partnerIsGuest, partnerGender, timestamp)
            return {"status": "searching"}
        
        logger.info(f"✅ Skip On: Room {roomId} verified - both users present ({verify_user1} + {verify_user2})")
        logger.info(f"✅ Skip On: Partner ID confirmed: {partnerId} (different from userId: {userId})")
        logger.info(f"✅ Skip On: Returning matched response")
        
        # Get partner name if available (for guest users, use a default)
        partnerName = "Someone"
        if not partnerIsGuest:
            # For authenticated users, we could fetch name from DB, but for now use ID
            partnerName = f"User {partnerId[:8]}"
        else:
            partnerName = f"Guest {partnerId[:8]}"
        
        # CRITICAL: Ensure partnerId is included in response
        response = {
            "status": "matched",
            "roomId": roomId,
            "partnerId": partnerId,  # MUST be present for frontend to create Firebase room
            "partnerName": partnerName,
            "isPartnerGuest": partnerIsGuest
        }
        logger.info(f"✅ Skip On: Response: {response}")
        logger.info(f"✅ Skip On: Response includes partnerId: {partnerId is not None and partnerId != ''}")
        return response
    else:
        # No one waiting in queue
        # Check if we're already in queue
        alreadyInQueue = await redis_queue_service.is_user_in_queue(userId)
        
        # Check if user already has a room (should only happen if matched)
        # CRITICAL: Only return "matched" if BOTH users are in the room
        existing_room_id = await redis_queue_service.get_user_room(userId)
        if existing_room_id:
            existing_room = await redis_queue_service.get_room(existing_room_id)
            if existing_room:
                # Check if room has both users (matched)
                user1 = existing_room.get('user1Id')
                user2 = existing_room.get('user2Id')
                
                # CRITICAL: Only return matched if BOTH users exist and are different
                if user1 and user2 and user1 != user2:
                    # Verify partner is different from current user
                    partnerId = user1 if user1 != userId else user2
                    # CRITICAL: Verify partnerId is valid (not empty, not same as userId)
                    if partnerId and partnerId != userId and partnerId.strip() != '':
                        partnerIsGuest = existing_room.get('user1IsGuest', False) if user1 != userId else existing_room.get('user2IsGuest', False)
                        logger.info(f"✅ Skip On: User {userId} already in matched room {existing_room_id} with {partnerId}")
                        return {
                            "status": "matched",
                            "roomId": existing_room_id,
                            "partnerId": partnerId,  # MUST be present and valid
                            "isPartnerGuest": partnerIsGuest
                        }
                    else:
                        logger.error(f"❌ Skip On: Invalid partnerId ({partnerId}) in room check for user {userId}")
                        await redis_queue_service.delete_room(existing_room_id)
                        return {"status": "searching"}
                else:
                    # Single-user room or invalid state - clean up and continue searching
                    logger.warning(f"⚠️ Skip On: User {userId} in single-user or invalid room {existing_room_id} (user1: {user1}, user2: {user2}), cleaning up")
                    await redis_queue_service.delete_room(existing_room_id)
        
        # User is already in queue (we added them at the start if they weren't)
        queue_length = await redis_queue_service.get_queue_length()
        logger.info(f"🔍 Skip On: User {userId} in queue, waiting for match (queue length: {queue_length})")
        
        # CRITICAL: Always return "searching" - this allows multiple users to search simultaneously
        # The backend is async and can handle concurrent requests from multiple browsers
        logger.info(f"🔍 Skip On: Returning searching response for user {userId}")
        logger.info(f"🔍 Skip On: Redis status - Connected: {redis_queue_service.is_connected}, Fallback: {redis_queue_service.fallback_mode}")
        response = {
            "status": "searching"
        }
        logger.info(f"🔍 Skip On: Response: {response}")
        return response

@api_router.post("/skip/leave")
async def skip_leave(
    request: Optional[SkipLeaveRequest] = Body(None),
    authorization: Optional[str] = Header(None)
):
    """
    Leave matchmaking queue or current room.
    Works for both authenticated and guest users.
    
    Request body (optional): { "guestId": "..." } for guest users
    """
    # Get user ID
    userId = None
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        # Extract user ID from token directly (works without MongoDB)
        try:
            payload = verify_token(token)
            if payload:
                token_user_id = payload.get("sub")
                if token_user_id:
                    userId = token_user_id
                    logger.info(f"🔍 Skip On: Leave - Authenticated user ID from token: {userId}")
        except Exception as e:
            logger.warning(f"🔍 Skip On: Leave - Error decoding token: {e}")
            # Continue to guestId check if token decode fails
    
    # If no auth, check for guestId in request body
    if not userId:
        if request and request.guestId:
            userId = request.guestId
        elif request is None or (request and not request.guestId):
            # Empty body - this is okay for leave, just return success
            # The frontend might call this without a guestId if cleanup happens
            logger.info("🔍 Skip On: Leave called without userId or guestId - no-op")
            return {"status": "left"}
        else:
            raise HTTPException(status_code=400, detail="Authentication required or guestId must be provided")
    
    # Remove from queue (with error handling)
    try:
        await redis_queue_service.remove_from_queue(userId)
    except Exception as e:
        logger.warning(f"⚠️ Skip On: Error removing from queue: {e}")
        # Continue anyway - not critical
    
    # Remove from room if in one (with error handling)
    try:
        roomId = await redis_queue_service.get_user_room(userId)
        if roomId:
            room = await redis_queue_service.get_room(roomId)
            if room:
                # Get partner ID
                user1Id = room.get('user1Id')
                user2Id = room.get('user2Id')
                partnerId = user1Id if user1Id != userId else user2Id
                
                # Clean up room
                await redis_queue_service.delete_room(roomId)
                
                logger.info(f"🚪 Skip On: User {userId} left room {roomId}, partner {partnerId} notified")
    except Exception as e:
        logger.warning(f"⚠️ Skip On: Error removing from room: {e}")
        # Continue anyway - not critical
    
    return {"status": "left"}

@api_router.get("/skip/status")
async def skip_status(
    guestId: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """
    Get current matchmaking status.
    Query param: guestId (for guest users)
    Returns: { status: "idle" | "searching" | "matched", roomId?, partnerId? }
    """
    userId = None
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        user = await get_current_user(db, token)
        if user:
            userId = user['_id']
    
    # If no auth, use guestId from query param
    if not userId and guestId:
        userId = guestId
    
    if not userId:
        return {"status": "idle"}
    
    # Check if in queue
    inQueue = await redis_queue_service.is_user_in_queue(userId)
    if inQueue:
        return {"status": "searching"}
    
    # Check if in room
    roomId = await redis_queue_service.get_user_room(userId)
    if roomId:
        room = await redis_queue_service.get_room(roomId)
        if room:
            user1Id = room.get('user1Id')
            user2Id = room.get('user2Id')
            partnerId = user1Id if user1Id != userId else user2Id
            return {
                "status": "matched",
                "roomId": roomId,
                "partnerId": partnerId
            }
    
    return {"status": "idle"}

# ======================
# Video Call Socket Events (SkipOn)
# ======================
@sio.event
async def skipon_video_call_initiate(sid, data):
    """Initiate a video call in SkipOn room"""
    room_id = data.get('roomId')
    caller_id = data.get('callerId')
    callee_id = data.get('calleeId')
    
    if not room_id or not caller_id or not callee_id:
        await sio.emit('video_call_error', {'message': 'Missing required fields'}, room=sid)
        return
    
    # Create video call
    call_data = create_video_call(room_id, caller_id, callee_id)
    
    # Join room for signaling
    await sio.enter_room(sid, f"skipon_video_{room_id}")
    
    # Notify callee
    await sio.emit('video_call_incoming', {
        'roomId': room_id,
        'callerId': caller_id,
        'callId': room_id
    }, room=f"skipon_video_{room_id}")
    
    logger.info(f"📹 Video call initiated: Room {room_id}, Caller: {caller_id}")

@sio.event
async def skipon_video_call_answer(sid, data):
    """Answer an incoming video call"""
    room_id = data.get('roomId')
    answerer_id = data.get('answererId')
    accepted = data.get('accepted', False)
    
    if not room_id:
        await sio.emit('video_call_error', {'message': 'Missing roomId'}, room=sid)
        return
    
    call_data = get_video_call(room_id)
    if not call_data:
        await sio.emit('video_call_error', {'message': 'Call not found'}, room=sid)
        return
    
    if accepted:
        update_call_status(room_id, "accepted")
        await sio.emit('video_call_accepted', {
            'roomId': room_id,
            'answererId': answerer_id
        }, room=f"skipon_video_{room_id}")
        logger.info(f"📹 Video call accepted: Room {room_id}, Answerer: {answerer_id}")
    else:
        update_call_status(room_id, "rejected")
        await sio.emit('video_call_rejected', {
            'roomId': room_id,
            'answererId': answerer_id
        }, room=f"skipon_video_{room_id}")
        end_video_call(room_id)
        logger.info(f"📹 Video call rejected: Room {room_id}, Answerer: {answerer_id}")

@sio.event
async def skipon_video_call_offer(sid, data):
    """Send WebRTC offer"""
    room_id = data.get('roomId')
    offer = data.get('offer')
    sender_id = data.get('senderId')
    
    if not room_id or not offer:
        await sio.emit('video_call_error', {'message': 'Missing offer data'}, room=sid)
        return
    
    # Forward offer to other participant
    await sio.emit('video_call_offer', {
        'roomId': room_id,
        'offer': offer,
        'senderId': sender_id
    }, room=f"skipon_video_{room_id}", skip_sid=sid)
    
    logger.info(f"📹 WebRTC offer sent: Room {room_id}, Sender: {sender_id}")

@sio.event
async def skipon_video_call_answer_webrtc(sid, data):
    """Send WebRTC answer"""
    room_id = data.get('roomId')
    answer = data.get('answer')
    sender_id = data.get('senderId')
    
    if not room_id or not answer:
        await sio.emit('video_call_error', {'message': 'Missing answer data'}, room=sid)
        return
    
    # Forward answer to other participant
    await sio.emit('video_call_answer', {
        'roomId': room_id,
        'answer': answer,
        'senderId': sender_id
    }, room=f"skipon_video_{room_id}", skip_sid=sid)
    
    logger.info(f"📹 WebRTC answer sent: Room {room_id}, Sender: {sender_id}")

@sio.event
async def skipon_video_call_ice_candidate(sid, data):
    """Send ICE candidate"""
    room_id = data.get('roomId')
    candidate = data.get('candidate')
    sender_id = data.get('senderId')
    
    if not room_id or not candidate:
        return
    
    # Forward ICE candidate to other participant
    await sio.emit('video_call_ice_candidate', {
        'roomId': room_id,
        'candidate': candidate,
        'senderId': sender_id
    }, room=f"skipon_video_{room_id}", skip_sid=sid)

@sio.event
async def skipon_video_call_end(sid, data):
    """End a video call"""
    room_id = data.get('roomId')
    user_id = data.get('userId')
    
    if not room_id:
        return
    
    # Notify other participant
    await sio.emit('video_call_ended', {
        'roomId': room_id,
        'endedBy': user_id
    }, room=f"skipon_video_{room_id}")
    
    # Clean up
    end_video_call(room_id)
    await sio.leave_room(sid, f"skipon_video_{room_id}")
    
    logger.info(f"📹 Video call ended: Room {room_id}, Ended by: {user_id}")

@sio.event
async def skipon_video_call_join_room(sid, data):
    """Join video call room for signaling"""
    room_id = data.get('roomId')
    if room_id:
        await sio.enter_room(sid, f"skipon_video_{room_id}")
        logger.info(f"📹 User joined video call room: {room_id}")

@sio.event
async def skipon_video_call_leave_room(sid, data):
    """Leave video call room"""
    room_id = data.get('roomId')
    if room_id:
        await sio.leave_room(sid, f"skipon_video_{room_id}")
        logger.info(f"📹 User left video call room: {room_id}")

# ======================
# SkipOn Chat Socket Events (Socket.IO messaging)
# ======================
@sio.event
async def skipon_join_chat_room(sid, data):
    """Join SkipOn chat room for messaging"""
    room_id = data.get('roomId')
    user_id = data.get('userId')
    
    if not room_id or not user_id:
        await sio.emit('skipon_error', {'message': 'Missing roomId or userId'}, room=sid)
        return
    
    # Verify room exists in Redis
    room = await redis_queue_service.get_room(room_id)
    if not room:
        await sio.emit('skipon_error', {'message': 'Room not found'}, room=sid)
        logger.error(f"❌ SkipOn Chat: Room {room_id} not found for user {user_id}")
        return
    
    # Verify user is part of this room
    room_user1 = room.get('user1Id')
    room_user2 = room.get('user2Id')
    if user_id != room_user1 and user_id != room_user2:
        await sio.emit('skipon_error', {'message': 'Not authorized for this room'}, room=sid)
        logger.error(f"❌ SkipOn Chat: User {user_id} not authorized for room {room_id}")
        return
    
    # Join Socket.IO room for messaging
    await sio.enter_room(sid, f"skipon_chat_{room_id}")
    
    # Get partner ID
    partner_id = room_user1 if user_id == room_user2 else room_user2
    
    logger.info(f"💬 SkipOn Chat: User {user_id} joined chat room {room_id}, partner: {partner_id}")
    await sio.emit('skipon_room_joined', {
        'roomId': room_id,
        'partnerId': partner_id
    }, room=sid)

@sio.event
async def skipon_send_message(sid, data):
    """Send chat message in SkipOn room"""
    room_id = data.get('roomId')
    user_id = data.get('userId')
    message = data.get('message')
    
    if not room_id or not user_id or not message:
        await sio.emit('skipon_error', {'message': 'Missing required fields'}, room=sid)
        return
    
    # Verify room exists
    room = await redis_queue_service.get_room(room_id)
    if not room:
        await sio.emit('skipon_error', {'message': 'Room not found'}, room=sid)
        return
    
    # Verify user is part of this room
    room_user1 = room.get('user1Id')
    room_user2 = room.get('user2Id')
    if user_id != room_user1 and user_id != room_user2:
        await sio.emit('skipon_error', {'message': 'Not authorized for this room'}, room=sid)
        return
    
    # Prepare message data
    message_data = {
        'roomId': room_id,
        'senderId': user_id,
        'message': message.strip(),
        'timestamp': datetime.utcnow().isoformat(),
    }
    
    # Broadcast to room (excludes sender automatically via skip_sid)
    await sio.emit('skipon_message_received', message_data, room=f"skipon_chat_{room_id}", skip_sid=sid)
    
    # Confirm to sender
    await sio.emit('skipon_message_sent', {
        'roomId': room_id,
        'timestamp': message_data['timestamp']
    }, room=sid)
    
    logger.info(f"💬 SkipOn Chat: {user_id} -> partner in room {room_id}: \"{message[:50]}{'...' if len(message) > 50 else ''}\"")

@sio.event
async def skipon_leave_chat_room(sid, data):
    """Leave SkipOn chat room"""
    room_id = data.get('roomId')
    user_id = data.get('userId')
    
    if room_id:
        await sio.leave_room(sid, f"skipon_chat_{room_id}")
        
        # Notify partner that user left
        await sio.emit('skipon_partner_left', {
            'roomId': room_id,
            'userId': user_id
        }, room=f"skipon_chat_{room_id}", skip_sid=sid)
        
        logger.info(f"💬 SkipOn Chat: User {user_id} left chat room {room_id}")

# Include router AFTER all routes are defined
# This ensures all routes are registered before including the router
app.include_router(api_router)

# CORS middleware already added above (before routes)

@app.on_event("startup")
async def startup_event():
    """Initialize database connection and indexes on startup."""
    global client, db
    
    # MongoDB disabled - using in-memory storage only
    logger.info("⚠️ MongoDB disabled - running in memory-only mode")
    logger.info("⚠️ Skip On matchmaking will work (uses Redis queue with in-memory fallback)")
    logger.info("⚠️ Other features requiring database will not work")
    client = None
    db = None
    
    # Initialize Redis for SkipOn queue
    logger.info("🔧 Initializing Redis for SkipOn matchmaking queue...")
    redis_connected = await redis_queue_service.connect()
    if redis_connected:
        logger.info("✅ Redis connected - SkipOn queue will use Redis (scalable)")
    else:
        logger.warning("⚠️ Redis unavailable - SkipOn queue will use in-memory fallback (not scalable)")
        logger.warning("💡 To enable Redis: docker run -d -p 6379:6379 --name redis-skipon redis:latest")
    
    # COMMENTED OUT: MongoDB initialization
    # try:
    #     # Initialize database with connection pooling
    #     client, db = await init_db()
    #     
    #     # Create indexes in the background (non-blocking)
    #     logger.info("Creating database indexes...")
    #     await create_indexes(db)
    #     logger.info("Database initialization complete!")
    #     
    # except Exception as e:
    #     logger.error(f"⚠️ Failed to initialize database: {e}")
    #     logger.warning("⚠️ Server will continue without database. Some features may not work.")
    #     logger.warning("⚠️ To enable full functionality, start MongoDB: brew services start mongodb-community")
    #     client = None
    #     db = None

@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection on shutdown."""
    # MongoDB disabled - no cleanup needed
    # await close_db()
    
    # Disconnect Redis
    await redis_queue_service.disconnect()
    
    logger.info("Server shutting down (MongoDB disabled, Redis disconnected)")

# Create Socket.IO ASGI app AFTER all routes and middleware are configured
# This wraps the FastAPI app so both Socket.IO and REST API work together
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Export socket_app for uvicorn
# Run with: uvicorn server:socket_app --host 0.0.0.0 --port 3003 --reload
