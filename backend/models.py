from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    USER = "user"
    GUEST = "guest"

class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    BANNED = "banned"

class RoomStatus(str, Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETED = "completed"

class FriendStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    BLOCKED = "blocked"

# User Models
class UserCreate(BaseModel):
    email: Optional[EmailStr] = None
    name: str
    city: str
    gender: Gender
    is_guest: bool = False
    guest_uuid: Optional[str] = None

class User(BaseModel):
    id: str = Field(alias="_id")
    email: Optional[EmailStr] = None
    name: str
    city: str
    gender: Gender
    status: UserStatus = UserStatus.ACTIVE
    is_guest: bool = False
    guest_uuid: Optional[str] = None
    avatar_base64: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    online: bool = False
    
    class Config:
        populate_by_name = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    gender: Optional[Gender] = None
    avatar_base64: Optional[str] = None

# Auth Models
class LoginRequest(BaseModel):
    email: EmailStr

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

class GuestLogin(BaseModel):
    guest_uuid: str
    name: str
    city: str
    gender: Gender

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

# Chat Models
class ChatMessage(BaseModel):
    id: str = Field(alias="_id")
    room_id: str
    user_id: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True

class ChatRoom(BaseModel):
    id: str = Field(alias="_id")
    participants: List[str]
    status: RoomStatus
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True

# Engage Models
class EngageRoom(BaseModel):
    id: str = Field(alias="_id")
    user1_id: str
    user2_id: Optional[str] = None
    user1_gender: Gender
    user2_gender: Optional[Gender] = None
    status: RoomStatus
    created_at: datetime = Field(default_factory=datetime.utcnow)
    matched_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True

# Watch Along Models
class WatchRoom(BaseModel):
    id: str = Field(alias="_id")
    host_id: str
    participants: List[str]
    video_url: str
    current_time: float = 0.0
    is_playing: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True

class WatchRoomCreate(BaseModel):
    video_url: str

# Sing Along Models
class SingRoom(BaseModel):
    id: str = Field(alias="_id")
    host_id: str
    participants: List[str]
    song_url: Optional[str] = None
    sync_timestamp: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True

# Game Models
class GameType(str, Enum):
    CHESS = "chess"

class GameRoom(BaseModel):
    id: str = Field(alias="_id")
    game_type: GameType
    host_id: str
    opponent_id: Optional[str] = None
    participants: List[str]
    game_state: dict  # Chess board state in FEN notation
    current_turn: Optional[str] = None
    winner_id: Optional[str] = None
    status: RoomStatus
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True

class ChessMove(BaseModel):
    from_pos: str  # e.g., "e2"
    to_pos: str    # e.g., "e4"
    promotion: Optional[str] = None  # for pawn promotion

# Friends Models
class Friend(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    friend_id: str
    status: FriendStatus
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True

class FriendRequest(BaseModel):
    friend_id: str

# Report Models
class Report(BaseModel):
    id: str = Field(alias="_id")
    reporter_id: str
    reported_id: str
    reason: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True

class ReportCreate(BaseModel):
    reported_id: str
    reason: str

# Skip On Models
class SkipMatchRequest(BaseModel):
    guestId: Optional[str] = None  # Required for guest users
    gender: Optional[Gender] = None  # Required for gender-based matching

class SkipLeaveRequest(BaseModel):
    guestId: Optional[str] = None  # Required for guest users
