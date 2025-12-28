"""
Database configuration stub
The matchmaking system uses in-memory queues and doesn't require MongoDB
"""

from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional

client: Optional[AsyncIOMotorClient] = None
db = None

async def init_db():
    """Initialize database connection (optional for matchmaking)"""
    global client, db
    # MongoDB is optional - matchmaking works without it
    # Uncomment if you need MongoDB:
    # mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    # client = AsyncIOMotorClient(mongo_uri)
    # db = client.get_database("app_db")
    pass

async def close_db():
    """Close database connection"""
    global client
    if client:
        client.close()

def get_db():
    """Get database instance"""
    return db

def get_client():
    """Get MongoDB client"""
    return client

