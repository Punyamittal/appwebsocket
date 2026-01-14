# Redis Setup for SkipOn Scalability

## Overview

The SkipOn matchmaking system now uses **Redis** for scalable queue management. This enables:
- ✅ **Horizontal scaling** (multiple backend instances)
- ✅ **Persistence** (survives server restarts)
- ✅ **Fast lookups** (O(log n) with sorted sets)
- ✅ **1000+ concurrent users** support

The system **automatically falls back** to in-memory storage if Redis is unavailable (for development).

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Start Redis container
docker run -d -p 6379:6379 --name redis-skipon redis:latest

# Verify it's running
docker ps | grep redis
```

### Option 2: Install Redis Locally

**Windows:**
- Download from: https://github.com/microsoftarchive/redis/releases
- Or use WSL: `wsl sudo apt-get install redis-server`

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

---

## Installation Steps

### 1. Install Python Redis Package

```bash
cd app/backend
pip install redis==5.0.1
```

Or install all requirements:
```bash
pip install -r requirements.txt
```

### 2. Start Redis

**Docker:**
```bash
docker run -d -p 6379:6379 --name redis-skipon redis:latest
```

**Local:**
```bash
redis-server
```

### 3. Configure Environment (Optional)

Create/update `app/backend/.env`:
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Leave empty if no password
```

### 4. Start Backend Server

```bash
cd app/backend
python -m uvicorn server:socket_app --host 0.0.0.0 --port 3001 --reload
```

**Check logs for:**
```
✅ Redis connected successfully for SkipOn queue
```

If Redis is unavailable, you'll see:
```
⚠️ Redis unavailable, using in-memory fallback
```

---

## Verification

### Test Redis Connection

```bash
# Using redis-cli
redis-cli ping
# Should return: PONG

# Check if keys exist
redis-cli keys "skipon:*"
```

### Check Backend Logs

When you start the backend, look for:
- ✅ `Redis connected successfully` = Redis is working
- ⚠️ `Redis unavailable, using in-memory fallback` = Fallback mode (not scalable)

---

## Architecture

### Redis Data Structure

```
skipon:queue:male      → Sorted set (userId → timestamp)
skipon:queue:female    → Sorted set (userId → timestamp)
skipon:queue:other     → Sorted set (userId → timestamp)

skipon:user:{userId}   → Hash {isGuest, gender, timestamp}
skipon:room:{roomId}   → Hash {user1Id, user2Id, ...}
skipon:user_room:{userId} → String (roomId)
```

### Benefits

1. **Gender-based queues**: Fast O(log n) lookups per gender
2. **Sorted sets**: Automatically sorted by timestamp (FIFO matching)
3. **TTL**: Automatic cleanup after 1 hour
4. **Atomic operations**: Prevents race conditions

---

## Troubleshooting

### Redis Not Connecting

**Error:** `⚠️ Redis unavailable, using in-memory fallback`

**Solutions:**
1. Check if Redis is running: `docker ps | grep redis` or `redis-cli ping`
2. Check port: Default is 6379
3. Check firewall: Ensure port 6379 is open
4. Check Redis logs: `docker logs redis-skipon`

### Performance Issues

**If queue is slow:**
- Check Redis memory: `redis-cli info memory`
- Check connection count: `redis-cli info clients`
- Consider Redis clustering for 10,000+ users

### Data Persistence

**Redis data is in-memory by default** (fast but lost on restart).

To enable persistence:
```bash
# Edit redis.conf
appendonly yes
save 60 1000

# Or use Docker with volume
docker run -d -p 6379:6379 -v redis-data:/data redis:latest redis-server --appendonly yes
```

---

## Production Recommendations

### For 1000+ Users

1. **Use Redis Cluster** (3+ nodes)
2. **Enable persistence** (AOF + RDB)
3. **Set up monitoring** (Redis Insight, Prometheus)
4. **Configure maxmemory** with eviction policy
5. **Use connection pooling** (already implemented)

### Environment Variables

```env
REDIS_HOST=redis-cluster.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
REDIS_SSL=true  # For production
```

---

## Fallback Mode

If Redis is unavailable, the system **automatically uses in-memory storage**:
- ✅ Works for development/testing
- ❌ **Not scalable** (single server only)
- ❌ Data lost on restart
- ⚠️ **Not recommended for production**

Always use Redis in production for scalability!

---

## Next Steps

After Redis is set up:
1. ✅ Queue is now scalable
2. ⏭️ **Phase 2**: Replace polling with WebSockets (coming next)
3. ⏭️ **Phase 3**: Add load balancing

---

**Questions?** Check backend logs for Redis connection status!



