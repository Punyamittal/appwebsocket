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

# In-memory matchmaking queue (or use Redis in production)
skip_matchmaking_queue = []  # List of { userId, isGuest, timestamp }
skip_active_rooms = {}  # Dict of { roomId: { user1Id, user2Id, user1IsGuest, user2IsGuest, createdAt } }
skip_user_to_room = {}  # Dict of { userId: roomId }

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
    
    # Get user ID (authenticated or guest)
    userId = None
    isGuest = False
    
    if authorization and authorization.startswith("Bearer "):
        # Authenticated user
        token = authorization.split(" ")[1]
        # Skip database lookup for demo guest tokens (they start with "demo_guest_token_")
        if token.startswith("demo_guest_token_"):
            logger.info("🔍 Skip On: Detected demo guest token, skipping database lookup")
            # Don't set userId here - let it fall through to guestId check
        else:
            # Real authenticated user - MongoDB disabled, treat as guest
            logger.info("🔍 Skip On: Authenticated token detected but MongoDB disabled - treating as guest")
            # Skip database lookup - MongoDB is disabled
            # try:
            #     user = await get_current_user(db, token)
            #     if user:
            #         userId = user['_id']
            #         isGuest = user.get('is_guest', False)
            #         logger.info(f"🔍 Skip On: Authenticated user found: {userId}")
            # except Exception as e:
            #     logger.error(f"🔍 Skip On: Error getting user from token: {e}")
            # Continue to guestId check
    
    # If no auth token or invalid, check for guestId in request body
    if not userId:
        logger.info("🔍 Skip On: No authenticated user, checking for guestId")
        if request and request.guestId:
            userId = request.guestId
            isGuest = True
            logger.info(f"🔍 Skip On: Using guestId from request: {userId}")
        elif request is None or (request and not request.guestId):
            # Empty body or no guestId - generate a temporary guest ID for this session
            # This allows the frontend to work even if guestId isn't set yet
            userId = f"temp_guest_{uuid.uuid4()}"
            isGuest = True
            logger.info(f"🔍 Skip On: Generated temporary guest ID: {userId}")
        else:
            logger.error("🔍 Skip On: No userId and no guestId provided")
            raise HTTPException(status_code=400, detail="Authentication required or guestId must be provided")
    
    logger.info(f"🔍 Skip On: Processing match for userId: {userId}, isGuest: {isGuest}")
    
    if not userId:
        logger.error("🔍 Skip On: No userId after processing, returning error")
        raise HTTPException(status_code=400, detail="Unable to determine user ID")
    
    # IMPORTANT: Check if user is already in a room (matched by another user's request)
    # This handles the case where User 1 is in queue, User 2 calls match() and gets matched,
    # but User 1 is still polling and needs to know they're matched
    if userId in skip_user_to_room:
        roomId = skip_user_to_room[userId]
        if roomId in skip_active_rooms:
            room = skip_active_rooms[roomId]
            # Get partner ID
            partnerId = room['user1Id'] if room['user1Id'] != userId else room['user2Id']
            partnerIsGuest = room['user1IsGuest'] if room['user1Id'] != userId else room['user2IsGuest']
            
            # CRITICAL: Verify partner is different from current user
            if partnerId == userId:
                logger.warning(f"⚠️ Skip On: User {userId} matched with themselves in room {roomId}, cleaning up")
                # Invalid room - user matched with themselves, clean up
                del skip_active_rooms[roomId]
                del skip_user_to_room[userId]
                if partnerId in skip_user_to_room:
                    del skip_user_to_room[partnerId]
                # Continue to normal matchmaking flow
            else:
                logger.info(f"✅ Skip On: User {userId} already in room {roomId} with partner {partnerId}")
                logger.info(f"✅ Skip On: Returning matched response for existing room")
                
                return {
                    "status": "matched",
                    "roomId": roomId,
                    "partnerId": partnerId,
                    "isPartnerGuest": partnerIsGuest
                }
        else:
            # Room doesn't exist, clean up
            del skip_user_to_room[userId]
    
    # IMPORTANT: Check if there's someone waiting BEFORE removing ourselves
    # This prevents race conditions where both users call match() simultaneously
    logger.info(f"🔍 Skip On: Queue length before check: {len(skip_matchmaking_queue)}")
    logger.info(f"🔍 Skip On: Queue contents: {[u['userId'] for u in skip_matchmaking_queue]}")
    logger.info(f"🔍 Skip On: Current user: {userId}")
    
    # FIRST: Check for existing rooms with only one user (waiting for a partner)
    # This handles the case where a room was created but the second user never joined
    waiting_room = None
    waiting_room_id = None
    waiting_user_id = None
    waiting_user_is_guest = False
    
    for room_id, room_data in skip_active_rooms.items():
        # Check if room has only one user (waiting for partner)
        user1 = room_data.get('user1Id')
        user2 = room_data.get('user2Id')
        
        # Room is waiting if it has user1 but no user2, or vice versa
        if user1 and not user2:
            waiting_room = room_data
            waiting_room_id = room_id
            waiting_user_id = user1
            waiting_user_is_guest = room_data.get('user1IsGuest', False)
            logger.info(f"🔍 Skip On: Found waiting room {room_id} with user {user1}")
            break
        elif user2 and not user1:
            waiting_room = room_data
            waiting_room_id = room_id
            waiting_user_id = user2
            waiting_user_is_guest = room_data.get('user2IsGuest', False)
            logger.info(f"🔍 Skip On: Found waiting room {room_id} with user {user2}")
            break
    
    # If we found a waiting room, match the new user to it
    if waiting_room and waiting_user_id and waiting_user_id != userId:
        logger.info(f"🔍 Skip On: Matching {userId} to existing waiting room {waiting_room_id} with user {waiting_user_id}")
        
        # Update the room to include the second user
        if not waiting_room.get('user1Id'):
            waiting_room['user1Id'] = userId
            waiting_room['user1IsGuest'] = isGuest
        elif not waiting_room.get('user2Id'):
            waiting_room['user2Id'] = userId
            waiting_room['user2IsGuest'] = isGuest
        
        # Update mappings
        skip_user_to_room[userId] = waiting_room_id
        skip_active_rooms[waiting_room_id] = waiting_room
        
        # Remove from queue if present
        skip_matchmaking_queue[:] = [u for u in skip_matchmaking_queue if u['userId'] != userId]
        skip_matchmaking_queue[:] = [u for u in skip_matchmaking_queue if u['userId'] != waiting_user_id]
        
        logger.info(f"✅ Skip On match: User {userId} joined existing room {waiting_room_id} with {waiting_user_id}")
        
        # Get partner name
        partnerName = "Someone"
        if not waiting_user_is_guest:
            partnerName = f"User {waiting_user_id[:8]}"
        else:
            partnerName = f"Guest {waiting_user_id[:8]}"
        
        return {
            "status": "matched",
            "roomId": waiting_room_id,
            "partnerId": waiting_user_id,
            "partnerName": partnerName,
            "isPartnerGuest": waiting_user_is_guest
        }
    
    # Check for matches in queue FIRST, before any queue manipulation
    # Filter out current user from queue check (they shouldn't be there, but safety check)
    available_partners = [u for u in skip_matchmaking_queue if u['userId'] != userId]
    
    if len(available_partners) > 0:
        # Match with first available partner
        partner = available_partners[0]
        partnerId = partner['userId']
        partnerIsGuest = partner.get('isGuest', False)
        
        logger.info(f"🔍 Skip On: Matching {userId} with {partnerId}")
        
        # Safety check: prevent matching with yourself
        if partnerId == userId:
            logger.warning(f"⚠️ Skip On: Attempted to match user {userId} with themselves, skipping")
            # Don't create room, just return searching
            return {
                "status": "searching"
            }
        
        # Remove partner from queue
        skip_matchmaking_queue[:] = [u for u in skip_matchmaking_queue if u['userId'] != partnerId]
        # Also remove current user from queue if they're there
        skip_matchmaking_queue[:] = [u for u in skip_matchmaking_queue if u['userId'] != userId]
        
        # Create room
        roomId = f"skip_{uuid.uuid4()}"
        skip_active_rooms[roomId] = {
            "user1Id": partnerId,
            "user2Id": userId,
            "user1IsGuest": partnerIsGuest,
            "user2IsGuest": isGuest,
            "createdAt": datetime.utcnow().isoformat()
        }
        skip_user_to_room[partnerId] = roomId
        skip_user_to_room[userId] = roomId
        
        logger.info(f"✅ Skip On match: Room {roomId} - {partnerId} + {userId}")
        logger.info(f"✅ Skip On: Returning matched response")
        
        # Get partner name if available (for guest users, use a default)
        partnerName = "Someone"
        if not partnerIsGuest:
            # For authenticated users, we could fetch name from DB, but for now use ID
            partnerName = f"User {partnerId[:8]}"
        else:
            partnerName = f"Guest {partnerId[:8]}"
        
        response = {
            "status": "matched",
            "roomId": roomId,
            "partnerId": partnerId,
            "partnerName": partnerName,
            "isPartnerGuest": partnerIsGuest
        }
        logger.info(f"✅ Skip On: Response: {response}")
        return response
    else:
        # No one waiting in queue and no waiting rooms
        # Check if we're already in queue
        alreadyInQueue = any(u['userId'] == userId for u in skip_matchmaking_queue)
        
        # Check if user already has a room (waiting for partner)
        user_has_waiting_room = userId in skip_user_to_room
        if user_has_waiting_room:
            existing_room_id = skip_user_to_room[userId]
            if existing_room_id in skip_active_rooms:
                existing_room = skip_active_rooms[existing_room_id]
                # Check if room only has one user (waiting for partner)
                user1 = existing_room.get('user1Id')
                user2 = existing_room.get('user2Id')
                if (user1 == userId and not user2) or (user2 == userId and not user1):
                    logger.info(f"🔍 Skip On: User {userId} already has waiting room {existing_room_id}, returning searching")
                    return {
                        "status": "searching"
                    }
        
        if not alreadyInQueue:
            # Add to queue
            skip_matchmaking_queue.append({
                "userId": userId,
                "isGuest": isGuest,
                "timestamp": datetime.utcnow().isoformat()
            })
            logger.info(f"🔍 Skip On: User {userId} added to queue (queue length: {len(skip_matchmaking_queue)})")
        else:
            logger.info(f"🔍 Skip On: User {userId} already in queue (queue length: {len(skip_matchmaking_queue)})")
        
        logger.info(f"🔍 Skip On: Returning searching response")
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
        user = await get_current_user(db, token)
        if user:
            userId = user['_id']
    
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
    
    # Remove from queue
    skip_matchmaking_queue[:] = [u for u in skip_matchmaking_queue if u['userId'] != userId]
    
    # Remove from room if in one
    if userId in skip_user_to_room:
        roomId = skip_user_to_room[userId]
        if roomId in skip_active_rooms:
            room = skip_active_rooms[roomId]
            # Get partner ID
            partnerId = room['user1Id'] if room['user1Id'] != userId else room['user2Id']
            
            # Clean up room
            del skip_active_rooms[roomId]
            if partnerId in skip_user_to_room:
                del skip_user_to_room[partnerId]
            del skip_user_to_room[userId]
            
            logger.info(f"🚪 Skip On: User {userId} left room {roomId}, partner {partnerId} notified")
        else:
            del skip_user_to_room[userId]
    
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
    inQueue = any(u['userId'] == userId for u in skip_matchmaking_queue)
    if inQueue:
        return {"status": "searching"}
    
    # Check if in room
    if userId in skip_user_to_room:
        roomId = skip_user_to_room[userId]
        if roomId in skip_active_rooms:
            room = skip_active_rooms[roomId]
            partnerId = room['user1Id'] if room['user1Id'] != userId else room['user2Id']
            return {
                "status": "matched",
                "roomId": roomId,
                "partnerId": partnerId
            }
    
    return {"status": "idle"}

# Include router AFTER all routes are defined
# This ensures all routes are registered before including the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize database connection and indexes on startup."""
    global client, db
    
    # MongoDB disabled - using in-memory storage only
    logger.info("⚠️ MongoDB disabled - running in memory-only mode")
    logger.info("⚠️ Skip On matchmaking will work (uses in-memory queue)")
    logger.info("⚠️ Other features requiring database will not work")
    client = None
    db = None
    
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
    logger.info("Server shutting down (MongoDB disabled)")

# Create Socket.IO ASGI app AFTER all routes and middleware are configured
# This wraps the FastAPI app so both Socket.IO and REST API work together
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Export socket_app for uvicorn
# Run with: uvicorn server:socket_app --host 0.0.0.0 --port 3003 --reload
