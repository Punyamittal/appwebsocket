# Scalability Guide - Supporting 1000+ Concurrent Users

## Current Architecture

The engage-server.js is optimized to handle **1000+ concurrent users** for chess games and other real-time features.

## Optimizations Implemented

### 1. Redis Connection Optimization
- **Connection pooling**: Single connection with keep-alive
- **Reconnection strategy**: Automatic reconnection with exponential backoff
- **Offline queue**: Commands queued during disconnection
- **Ready check**: Ensures Redis is ready before accepting commands

### 2. Socket.IO Configuration
- **Max connections**: 2000 concurrent connections per server instance
- **Keep-alive**: 65 seconds to maintain connections
- **Ping/pong**: 25-second intervals for connection health
- **Message size limit**: 1MB per message
- **Compression disabled**: Reduces CPU usage for high concurrency

### 3. Server Configuration
- **HTTP keep-alive**: Enabled for persistent connections
- **Connection monitoring**: Tracks active connections
- **Graceful degradation**: Handles connection errors gracefully

## Performance Characteristics

### Single Server Instance
- **Concurrent connections**: Up to 2000
- **Chess games**: ~500 simultaneous games (2 players each)
- **Memory usage**: ~50-100MB per 100 connections
- **CPU usage**: Low (event-driven architecture)

### Redis Performance
- **Operations per second**: 100,000+ (Redis can handle much more)
- **Room lookups**: O(1) with code mapping
- **Memory usage**: ~1KB per active game room

## Scaling Beyond 1000 Users

### Horizontal Scaling (Recommended)

1. **Multiple Server Instances**
   ```bash
   # Run multiple instances on different ports
   PORT=3002 node engage-server.js
   PORT=3003 node engage-server.js
   PORT=3004 node engage-server.js
   ```

2. **Load Balancer**
   - Use nginx, HAProxy, or cloud load balancer
   - Sticky sessions (session affinity) for WebSocket connections
   - Health checks for server instances

3. **Redis Cluster** (for 10,000+ users)
   - Use Redis Cluster for distributed state
   - Shard room data across multiple Redis nodes
   - Update code to use Redis Cluster client

### Vertical Scaling

1. **Increase Server Resources**
   - CPU: 4+ cores recommended
   - RAM: 2GB+ for 1000 users
   - Network: High bandwidth for WebSocket traffic

2. **Redis Optimization**
   - Increase Redis maxmemory
   - Enable Redis persistence (AOF/RDB)
   - Use Redis Sentinel for high availability

## Monitoring

### Key Metrics to Track

1. **Connection Count**
   - Active WebSocket connections
   - Connection rate (connections/second)
   - Disconnection rate

2. **Redis Performance**
   - Command latency
   - Memory usage
   - Connection count

3. **Server Resources**
   - CPU usage
   - Memory usage
   - Network I/O

### Monitoring Tools

```javascript
// Add to engage-server.js
setInterval(() => {
  const stats = {
    connections: connectionCount,
    rooms: await redisClient.keys('chess:room:*').length,
    memory: process.memoryUsage(),
  };
  console.log('[STATS]', JSON.stringify(stats));
}, 60000); // Every minute
```

## Best Practices

### 1. Room Cleanup
- Rooms automatically expire after 1 hour (3600 seconds)
- Clean up on disconnect
- Monitor for orphaned rooms

### 2. Error Handling
- Graceful error handling for Redis failures
- Automatic reconnection
- User-friendly error messages

### 3. Rate Limiting
- Consider adding rate limits for:
  - Room creation (e.g., 10 rooms per user per hour)
  - Move submissions (e.g., 100 moves per minute)
  - Connection attempts

### 4. Resource Management
- Monitor memory usage
- Set up alerts for high connection counts
- Implement circuit breakers for Redis

## Testing at Scale

### Load Testing Tools

1. **Artillery.io**
   ```bash
   npm install -g artillery
   artillery quick --count 1000 --num 10 http://localhost:3002
   ```

2. **k6**
   ```bash
   k6 run --vus 1000 --duration 5m load-test.js
   ```

### Test Scenarios

1. **1000 concurrent connections**
2. **500 simultaneous chess games**
3. **Rapid room creation/joining**
4. **High move frequency**

## Production Checklist

- [ ] Redis persistence enabled
- [ ] Load balancer configured
- [ ] Health check endpoints
- [ ] Monitoring and alerting
- [ ] Logging configured
- [ ] Rate limiting implemented
- [ ] Error tracking (Sentry, etc.)
- [ ] Backup strategy
- [ ] Disaster recovery plan

## Estimated Capacity

| Users | Server Instances | Redis Setup | Notes |
|-------|-----------------|-------------|-------|
| 100-500 | 1 | Single | Current setup |
| 500-2000 | 1-2 | Single | Add monitoring |
| 2000-5000 | 2-3 | Single/Sentinel | Load balancer |
| 5000-10000 | 3-5 | Sentinel | Redis Cluster |
| 10000+ | 5+ | Cluster | Full production setup |

## Troubleshooting

### High Connection Count
- Check for connection leaks
- Verify proper cleanup on disconnect
- Monitor Redis memory

### Slow Performance
- Check Redis latency
- Monitor CPU usage
- Review network bandwidth
- Check for memory leaks

### Redis Errors
- Verify Redis is running
- Check connection limits
- Review Redis logs
- Monitor Redis memory

