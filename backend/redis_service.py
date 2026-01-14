"""
Redis Service for SkipOn Matchmaking Queue
Provides scalable queue management using Redis instead of in-memory structures.
Falls back to in-memory if Redis is unavailable.
"""

import redis.asyncio as redis
import os
import logging
import json
from typing import Optional, List, Dict, Any
from datetime import datetime
logger = logging.getLogger(__name__)

# Import Gender from models (will be imported at runtime to avoid circular dependency)
# We'll use it as a type hint and convert to string when needed
try:
    from models import Gender
except ImportError:
    # Fallback if models not available
    from enum import Enum
    class Gender(str, Enum):
        MALE = "male"
        FEMALE = "female"
        OTHER = "other"

class RedisQueueService:
    """Redis-based queue service for SkipOn matchmaking"""
    
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.is_connected = False
        self.fallback_mode = False
        # Fallback in-memory storage (if Redis unavailable)
        # Note: Python's GIL ensures thread-safety for simple list/dict operations
        # but we use async, so operations are naturally concurrent-safe
        self.fallback_queue: List[Dict[str, Any]] = []
        self.fallback_rooms: Dict[str, Dict[str, Any]] = {}
        self.fallback_user_to_room: Dict[str, str] = {}
        
    async def connect(self):
        """Connect to Redis with fallback to in-memory"""
        try:
            redis_host = os.getenv("REDIS_HOST", "localhost")
            redis_port = int(os.getenv("REDIS_PORT", "6379"))
            redis_password = os.getenv("REDIS_PASSWORD", None)
            
            self.redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                password=redis_password,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_keepalive=True,
                health_check_interval=30
            )
            
            # Test connection
            await self.redis_client.ping()
            self.is_connected = True
            self.fallback_mode = False
            logger.info("✅ Redis connected successfully for SkipOn queue")
            return True
            
        except Exception as e:
            logger.warning(f"⚠️ Redis unavailable, using in-memory fallback: {e}")
            self.is_connected = False
            self.fallback_mode = True
            return False
    
    async def disconnect(self):
        """Disconnect from Redis"""
        if self.redis_client:
            try:
                await self.redis_client.close()
                logger.info("Redis disconnected")
            except Exception as e:
                logger.error(f"Error disconnecting Redis: {e}")
    
    # ==================== Queue Operations ====================
    
    async def add_to_queue(self, userId: str, isGuest: bool, gender, timestamp: str) -> bool:
        """Add user to matchmaking queue"""
        if self.fallback_mode:
            # In-memory fallback
            if not any(u['userId'] == userId for u in self.fallback_queue):
                self.fallback_queue.append({
                    "userId": userId,
                    "isGuest": isGuest,
                    "gender": gender.value,
                    "timestamp": timestamp
                })
                logger.info(f"🔍 [Fallback] User {userId} added to queue (length: {len(self.fallback_queue)})")
            return True
        
        try:
            # Use Redis sorted sets - one per gender for fast lookup
            gender_value = gender.value if hasattr(gender, 'value') else str(gender)
            gender_key = f"skipon:queue:{gender_value}"
            user_data = json.dumps({
                "userId": userId,
                "isGuest": isGuest,
                "gender": gender_value,
                "timestamp": timestamp
            })
            
            # Add to gender-specific queue with timestamp as score
            score = datetime.fromisoformat(timestamp).timestamp()
            await self.redis_client.zadd(gender_key, {user_data: score})
            
            # Also store user metadata
            await self.redis_client.hset(
                f"skipon:user:{userId}",
                mapping={
                    "isGuest": str(isGuest),
                    "gender": gender_value,
                    "timestamp": timestamp
                }
            )
            await self.redis_client.expire(f"skipon:user:{userId}", 3600)  # 1 hour TTL
            
            logger.info(f"🔍 User {userId} added to Redis queue (gender: {gender_value})")
            return True
            
        except Exception as e:
            logger.error(f"Error adding to Redis queue: {e}, falling back to in-memory")
            self.fallback_mode = True
            return await self.add_to_queue(userId, isGuest, gender, timestamp)
    
    async def remove_from_queue(self, userId: str) -> bool:
        """Remove user from queue"""
        if self.fallback_mode:
            self.fallback_queue[:] = [u for u in self.fallback_queue if u['userId'] != userId]
            return True
        
        try:
            # Get user gender first
            user_data = await self.redis_client.hgetall(f"skipon:user:{userId}")
            if user_data:
                gender = user_data.get("gender", "other")
                gender_key = f"skipon:queue:{gender}"
                
                # Find and remove from sorted set
                members = await self.redis_client.zrange(gender_key, 0, -1)
                for member in members:
                    user_info = json.loads(member)
                    if user_info.get("userId") == userId:
                        await self.redis_client.zrem(gender_key, member)
                        break
                
                # Remove user metadata
                await self.redis_client.delete(f"skipon:user:{userId}")
                logger.info(f"🔍 User {userId} removed from Redis queue")
            
            return True
            
        except Exception as e:
            logger.error(f"Error removing from Redis queue: {e}")
            return False
    
    async def get_queue_length(self) -> int:
        """Get total queue length"""
        if self.fallback_mode:
            length = len(self.fallback_queue)
            logger.info(f"🔍 Queue length (fallback): {length}, Users: {[u.get('userId') for u in self.fallback_queue]}")
            return length
        
        try:
            total = 0
            queue_details = {}
            for gender in ["male", "female", "other"]:
                gender_key = f"skipon:queue:{gender}"
                count = await self.redis_client.zcard(gender_key)
                total += count
                if count > 0:
                    queue_details[gender] = count
            if queue_details:
                logger.info(f"🔍 Queue length (Redis): {total}, Breakdown: {queue_details}")
            return total
        except Exception as e:
            logger.error(f"Error getting queue length: {e}")
            return len(self.fallback_queue) if self.fallback_mode else 0
    
    async def get_compatible_partners(self, userId: str, userGender) -> List[Dict[str, Any]]:
        """Get compatible partners from queue (opposite gender or both OTHER)"""
        if self.fallback_mode:
            compatible = []
            user_gender_value = userGender.value if hasattr(userGender, 'value') else str(userGender)
            logger.info(f"🔍 [Fallback] Looking for compatible partners for {userId} (gender: {user_gender_value})")
            logger.info(f"🔍 [Fallback] Queue has {len(self.fallback_queue)} users: {[u.get('userId') + ' (' + u.get('gender', 'other') + ')' for u in self.fallback_queue]}")
            for u in self.fallback_queue:
                if u['userId'] == userId:
                    continue
                partner_gender_str = u.get('gender', 'other')
                partner_gender = Gender(partner_gender_str)
                if self._are_genders_compatible(userGender, partner_gender):
                    logger.info(f"🔍 [Fallback] Found compatible partner: {u.get('userId')} (gender: {partner_gender_str})")
                    compatible.append(u)
            logger.info(f"🔍 [Fallback] Returning {len(compatible)} compatible partners")
            return compatible
        
        try:
            compatible = []
            
            # Determine which gender queues to check
            user_gender_value = userGender.value if hasattr(userGender, 'value') else str(userGender)
            
            if user_gender_value == "male":
                check_genders = ["female", "other"]
            elif user_gender_value == "female":
                check_genders = ["male", "other"]
            else:  # other
                check_genders = ["other"]
            
            # Get first compatible user from each relevant queue
            for gender_str in check_genders:
                gender_key = f"skipon:queue:{gender_str}"
                members = await self.redis_client.zrange(gender_key, 0, 0)  # Get first (oldest)
                logger.info(f"🔍 [Redis] Checking {gender_str} queue: {len(members)} members")
                
                for member in members:
                    user_info = json.loads(member)
                    partner_id = user_info.get("userId")
                    if partner_id != userId:
                        logger.info(f"🔍 [Redis] Found compatible partner: {partner_id} (gender: {gender_str})")
                        compatible.append(user_info)
                        break  # Only take first from each queue
            
            logger.info(f"🔍 [Redis] Returning {len(compatible)} compatible partners")
            return compatible
            
        except Exception as e:
            logger.error(f"Error getting compatible partners: {e}")
            return []
    
    def _are_genders_compatible(self, gender1, gender2) -> bool:
        """Check if two genders are compatible"""
        g1 = gender1.value if hasattr(gender1, 'value') else str(gender1)
        g2 = gender2.value if hasattr(gender2, 'value') else str(gender2)
        
        if g1 == "other" and g2 == "other":
            return True
        if (g1 == "male" and g2 == "female") or (g1 == "female" and g2 == "male"):
            return True
        return False
    
    # ==================== Room Operations ====================
    
    async def create_room(self, roomId: str, user1Id: str, user2Id: str, 
                         user1IsGuest: bool, user2IsGuest: bool,
                         user1Gender, user2Gender) -> bool:
        """Create a matchmaking room"""
        if self.fallback_mode:
            self.fallback_rooms[roomId] = {
                "user1Id": user1Id,
                "user2Id": user2Id,
                "user1IsGuest": user1IsGuest,
                "user2IsGuest": user2IsGuest,
                "user1Gender": user1Gender.value,
                "user2Gender": user2Gender.value,
                "createdAt": datetime.utcnow().isoformat()
            }
            self.fallback_user_to_room[user1Id] = roomId
            self.fallback_user_to_room[user2Id] = roomId
            return True
        
        try:
            user1_gender_value = user1Gender.value if hasattr(user1Gender, 'value') else str(user1Gender)
            user2_gender_value = user2Gender.value if hasattr(user2Gender, 'value') else str(user2Gender)
            
            room_data = {
                "user1Id": user1Id,
                "user2Id": user2Id,
                "user1IsGuest": str(user1IsGuest),
                "user2IsGuest": str(user2IsGuest),
                "user1Gender": user1_gender_value,
                "user2Gender": user2_gender_value,
                "createdAt": datetime.utcnow().isoformat()
            }
            
            await self.redis_client.hset(f"skipon:room:{roomId}", mapping=room_data)
            await self.redis_client.expire(f"skipon:room:{roomId}", 3600)  # 1 hour TTL
            
            # Map users to room
            await self.redis_client.setex(f"skipon:user_room:{user1Id}", 3600, roomId)
            await self.redis_client.setex(f"skipon:user_room:{user2Id}", 3600, roomId)
            
            logger.info(f"✅ Room {roomId} created in Redis")
            return True
            
        except Exception as e:
            logger.error(f"Error creating room in Redis: {e}")
            self.fallback_mode = True
            return await self.create_room(roomId, user1Id, user2Id, user1IsGuest, 
                                        user2IsGuest, user1Gender, user2Gender)
    
    async def get_room(self, roomId: str) -> Optional[Dict[str, Any]]:
        """Get room data"""
        if self.fallback_mode:
            return self.fallback_rooms.get(roomId)
        
        try:
            room_data = await self.redis_client.hgetall(f"skipon:room:{roomId}")
            if room_data:
                # Convert string booleans back
                room_data['user1IsGuest'] = room_data.get('user1IsGuest') == 'True'
                room_data['user2IsGuest'] = room_data.get('user2IsGuest') == 'True'
                return room_data
            return None
        except Exception as e:
            logger.error(f"Error getting room from Redis: {e}")
            return self.fallback_rooms.get(roomId) if self.fallback_mode else None
    
    async def get_user_room(self, userId: str) -> Optional[str]:
        """Get room ID for a user"""
        if self.fallback_mode:
            return self.fallback_user_to_room.get(userId)
        
        try:
            roomId = await self.redis_client.get(f"skipon:user_room:{userId}")
            return roomId
        except Exception as e:
            logger.error(f"Error getting user room from Redis: {e}")
            return self.fallback_user_to_room.get(userId) if self.fallback_mode else None
    
    async def delete_room(self, roomId: str) -> bool:
        """Delete a room"""
        if self.fallback_mode:
            if roomId in self.fallback_rooms:
                room = self.fallback_rooms[roomId]
                user1Id = room.get('user1Id')
                user2Id = room.get('user2Id')
                del self.fallback_rooms[roomId]
                if user1Id in self.fallback_user_to_room:
                    del self.fallback_user_to_room[user1Id]
                if user2Id in self.fallback_user_to_room:
                    del self.fallback_user_to_room[user2Id]
            return True
        
        try:
            # Get room data first to find user IDs
            room_data = await self.get_room(roomId)
            if room_data:
                user1Id = room_data.get('user1Id')
                user2Id = room_data.get('user2Id')
                
                # Delete user-room mappings
                if user1Id:
                    await self.redis_client.delete(f"skipon:user_room:{user1Id}")
                if user2Id:
                    await self.redis_client.delete(f"skipon:user_room:{user2Id}")
            
            # Delete room
            await self.redis_client.delete(f"skipon:room:{roomId}")
            logger.info(f"🗑️ Room {roomId} deleted from Redis")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting room from Redis: {e}")
            return False
    
    async def is_user_in_queue(self, userId: str) -> bool:
        """Check if user is in queue"""
        if self.fallback_mode:
            return any(u['userId'] == userId for u in self.fallback_queue)
        
        try:
            # Check if user metadata exists
            exists = await self.redis_client.exists(f"skipon:user:{userId}")
            return exists > 0
        except Exception as e:
            logger.error(f"Error checking if user in queue: {e}")
            return any(u['userId'] == userId for u in self.fallback_queue) if self.fallback_mode else False
    
    async def claim_partner_for_matching(self, userId: str, partnerId: str) -> bool:
        """
        Atomically claim a partner for matching.
        Returns True if successfully claimed, False if already claimed by someone else.
        This prevents race conditions where multiple users try to match with the same partner.
        """
        if self.fallback_mode:
            # In fallback mode, use a simple check-and-remove
            # Check if partner is still in queue
            partner_in_queue = any(u['userId'] == partnerId for u in self.fallback_queue)
            if partner_in_queue:
                # Remove partner from queue
                self.fallback_queue[:] = [u for u in self.fallback_queue if u['userId'] != partnerId]
                return True
            return False
        
        try:
            # Use Redis SETNX to atomically claim the partner
            # Key: "skipon:claiming:{partnerId}" with value: userId
            # Expires in 5 seconds (enough time to complete matching)
            claim_key = f"skipon:claiming:{partnerId}"
            claimed = await self.redis_client.set(claim_key, userId, nx=True, ex=5)
            
            if not claimed:
                # Already claimed by someone else
                return False
            
            # Check if partner is still in queue
            user_data = await self.redis_client.hgetall(f"skipon:user:{partnerId}")
            if not user_data:
                # Partner not in queue anymore
                await self.redis_client.delete(claim_key)
                return False
            
            # Remove partner from queue
            gender = user_data.get("gender", "other")
            gender_key = f"skipon:queue:{gender}"
            members = await self.redis_client.zrange(gender_key, 0, -1)
            for member in members:
                user_info = json.loads(member)
                if user_info.get("userId") == partnerId:
                    await self.redis_client.zrem(gender_key, member)
                    await self.redis_client.delete(f"skipon:user:{partnerId}")
                    logger.info(f"🔍 Partner {partnerId} claimed and removed from queue by {userId}")
                    return True
            
            # Partner not found in queue
            await self.redis_client.delete(claim_key)
            return False
            
        except Exception as e:
            logger.error(f"Error claiming partner: {e}")
            return False
    
    async def release_partner_claim(self, partnerId: str):
        """Release the claim on a partner (cleanup)"""
        if self.fallback_mode:
            return
        
        try:
            claim_key = f"skipon:claiming:{partnerId}"
            await self.redis_client.delete(claim_key)
        except Exception as e:
            logger.error(f"Error releasing partner claim: {e}")

# Global instance
redis_queue_service = RedisQueueService()

