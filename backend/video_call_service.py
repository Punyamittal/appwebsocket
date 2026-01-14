"""
Video Call Service for SkipOn
Handles WebRTC signaling via Socket.IO
"""

import logging
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Store active video calls: {roomId: {callerId, calleeId, status, createdAt}}
active_video_calls: Dict[str, Dict] = {}

def get_video_call(roomId: str) -> Optional[Dict]:
    """Get video call info for a room"""
    return active_video_calls.get(roomId)

def create_video_call(roomId: str, callerId: str, calleeId: str) -> Dict:
    """Create a new video call"""
    call_data = {
        "callerId": callerId,
        "calleeId": calleeId,
        "status": "ringing",
        "createdAt": datetime.utcnow().isoformat()
    }
    active_video_calls[roomId] = call_data
    logger.info(f"📹 Video call created: Room {roomId}, Caller: {callerId}, Callee: {calleeId}")
    return call_data

def update_call_status(roomId: str, status: str):
    """Update call status (ringing, accepted, rejected, ended)"""
    if roomId in active_video_calls:
        active_video_calls[roomId]["status"] = status
        logger.info(f"📹 Video call status updated: Room {roomId}, Status: {status}")

def end_video_call(roomId: str):
    """End a video call"""
    if roomId in active_video_calls:
        del active_video_calls[roomId]
        logger.info(f"📹 Video call ended: Room {roomId}")



