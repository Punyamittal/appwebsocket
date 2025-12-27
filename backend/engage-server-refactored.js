/**
 * ENGAGE Feature - Socket.IO Server (REFACTORED)
 * 
 * Architecture Improvements:
 * - Non-blocking server startup (Redis-independent)
 * - Fast socket handshake acknowledgment
 * - Graceful Redis degradation
 * - Event-based game handling
 * - Redis Pub/Sub for scalability
 * - PM2-ready process management
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const cors = require('cors');
const { Chess } = require('chess.js');

// ====================================
// EXPRESS SETUP
// ====================================
const app = express();
app.use(cors({
  origin: '*',
  credentials: true,
}));

// Health check endpoints (work even without Redis)
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    server: 'Engage Socket.IO Server',
    port: process.env.ENGAGE_PORT || 3002,
    redis: redisClient?.isReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    namespaces: ['/watch-along', '/play-along', '/sing-along'],
    redis: redisClient?.isReady ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

const server = http.createServer(app);

// Optimize server for high concurrency
server.maxConnections = 2000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  perMessageDeflation: false,
  maxHttpBufferSize: 1e6,
  allowEIO3: true,
});

// ====================================
// REDIS SETUP (Non-Blocking)
// ====================================
let redisClient = null;
let redisSubscriber = null; // For Pub/Sub
let redisReady = false;

// Redis connection with graceful degradation
const initRedis = async () => {
  try {
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[REDIS] Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        },
        keepAlive: true,
        keepAliveInitialDelay: 10000,
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
    });

    redisClient.on('error', (err) => {
      console.error('[REDIS] Connection error:', err.message);
      redisReady = false;
    });

    redisClient.on('connect', () => {
      console.log('[REDIS] Connected successfully');
    });

    redisClient.on('ready', () => {
      console.log('[REDIS] ✅ Ready to accept commands');
      redisReady = true;
    });

    redisClient.on('reconnecting', () => {
      console.log('[REDIS] Reconnecting...');
      redisReady = false;
    });

    // Connect asynchronously - don't block server startup
    redisClient.connect().catch((error) => {
      console.error('[REDIS] ❌ Failed to connect:', error.message);
      console.error('[REDIS] ⚠️  Server will continue but features will be limited');
      redisReady = false;
    });

    // Initialize Pub/Sub subscriber for scalable game sync
    redisSubscriber = redisClient.duplicate();
    await redisSubscriber.connect();
    console.log('[REDIS] ✅ Pub/Sub subscriber connected');

  } catch (error) {
    console.error('[REDIS] ❌ Initialization error:', error.message);
    redisReady = false;
  }
};

// Start Redis connection (non-blocking)
initRedis().catch(err => {
  console.error('[REDIS] Failed to initialize:', err.message);
});

// ====================================
// REDIS KEY PATTERNS
// ====================================
const REDIS_KEYS = {
  WATCH_ROOM: (roomId) => `watchalong:room:${roomId}`,
  CHESS_ROOM: (roomId) => `chess:room:${roomId}`,
  CHESS_CODE: (code) => `chess:code:${code}`,
  SING_ROOM: (roomId) => `singalong:room:${roomId}`,
};

// ====================================
// HELPER FUNCTIONS
// ====================================

function generateRoomId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `room_${timestamp}_${random}`;
}

/**
 * Generate unique 6-digit room code
 * Non-blocking with retry logic
 */
async function generateRoomCode(maxRetries = 10) {
  if (!redisReady || !redisClient) {
    // Fallback: generate code without Redis check (for development)
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  for (let i = 0; i < maxRetries; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const key = REDIS_KEYS.CHESS_CODE(code);
    
    try {
      const exists = await redisClient.exists(key);
      if (!exists) {
        return code;
      }
    } catch (error) {
      console.error('[REDIS] Error checking code:', error.message);
      // Fallback to generated code if Redis fails
      return code;
    }
  }
  
  // Last resort: return a code anyway (collision unlikely)
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Safe Redis operation wrapper
 * Returns null on error, allowing graceful degradation
 */
async function safeRedisGet(key) {
  if (!redisReady || !redisClient) return null;
  try {
    return await redisClient.get(key);
  } catch (error) {
    console.error(`[REDIS] Get error for ${key}:`, error.message);
    return null;
  }
}

async function safeRedisSetEx(key, seconds, value) {
  if (!redisReady || !redisClient) return false;
  try {
    await redisClient.setEx(key, seconds, value);
    return true;
  } catch (error) {
    console.error(`[REDIS] SetEx error for ${key}:`, error.message);
    return false;
  }
}

async function safeRedisDel(key) {
  if (!redisReady || !redisClient) return false;
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error(`[REDIS] Del error for ${key}:`, error.message);
    return false;
  }
}

function isAuthenticated(socket) {
  return socket.handshake.auth?.token || socket.handshake.auth?.userId;
}

function getUserId(socket) {
  return socket.handshake.auth?.userId || socket.handshake.auth?.token || socket.id;
}

// ====================================
// PLAY ALONG (CHESS) NAMESPACE
// ====================================
const playAlongNamespace = io.of('/play-along');

// Fast handshake - no blocking
playAlongNamespace.use((socket, next) => {
  // ALWAYS allow connection immediately
  const hasAuth = socket.handshake.auth?.token || socket.handshake.auth?.userId;
  socket.data.isAuthenticated = !!hasAuth;
  socket.data.userId = getUserId(socket);
  
  // Call next() immediately - no await, no blocking
  next();
});

// Connection handler - fast acknowledgment
playAlongNamespace.on('connection', (socket) => {
  const userId = socket.data.userId || socket.id;
  console.log(`[PLAY-ALONG] ✅ User ${userId} connected (socket: ${socket.id})`);
  
  // IMMEDIATE acknowledgment - don't wait for anything
  socket.emit('server_ready', { 
    socketId: socket.id, 
    userId,
    redisReady,
    timestamp: Date.now()
  });
  
  // Also emit legacy 'connected' event for compatibility
  socket.emit('connected', { socketId: socket.id, userId });

  // Create chess room - event-based, non-blocking
  socket.on('create_chess_room', async () => {
    try {
      // Check Redis availability
      if (!redisReady) {
        socket.emit('error', { 
          message: 'Server is initializing. Please try again in a moment.',
          code: 'REDIS_NOT_READY'
        });
        return;
      }

      const roomId = generateRoomId();
      const roomCode = await generateRoomCode();
      const game = new Chess();
      
      const roomData = {
        roomId,
        roomCode,
        whitePlayer: userId,
        blackPlayer: null,
        fen: game.fen(),
        turn: 'white',
        status: 'waiting',
        winner: null,
        createdAt: new Date().toISOString(),
      };

      // Store room data (non-blocking with error handling)
      const stored = await safeRedisSetEx(
        REDIS_KEYS.CHESS_ROOM(roomId), 
        3600, 
        JSON.stringify(roomData)
      );
      
      if (!stored) {
        socket.emit('error', { 
          message: 'Failed to create room. Please try again.',
          code: 'REDIS_ERROR'
        });
        return;
      }

      // Store code -> roomId mapping
      await safeRedisSetEx(REDIS_KEYS.CHESS_CODE(roomCode), 3600, roomId);
      
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.color = 'white';

      console.log(`[PLAY-ALONG] ✅ Chess room ${roomId} created by ${userId} - Code: ${roomCode}`);
      
      // Emit success immediately
      socket.emit('room_created', { 
        roomId, 
        roomCode, 
        ...roomData 
      });
    } catch (error) {
      console.error('[PLAY-ALONG] ❌ Error creating chess room:', error);
      socket.emit('error', { 
        message: 'Failed to create game room',
        code: 'UNKNOWN_ERROR'
      });
    }
  });

  // Join chess room
  socket.on('join_chess_room', async ({ roomId, roomCode }) => {
    try {
      if (!redisReady) {
        socket.emit('error', { 
          message: 'Server is initializing. Please try again.',
          code: 'REDIS_NOT_READY'
        });
        return;
      }

      let actualRoomId = roomId;

      if (!actualRoomId && roomCode) {
        const normalizedCode = roomCode.trim();
        actualRoomId = await safeRedisGet(REDIS_KEYS.CHESS_CODE(normalizedCode));
        
        if (!actualRoomId) {
          socket.emit('error', { message: 'Invalid room code', code: 'INVALID_CODE' });
          return;
        }
      }

      if (!actualRoomId) {
        socket.emit('error', { message: 'Room ID or code is required', code: 'MISSING_ID' });
        return;
      }

      const roomDataStr = await safeRedisGet(REDIS_KEYS.CHESS_ROOM(actualRoomId));
      if (!roomDataStr) {
        socket.emit('error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
        return;
      }

      const roomData = JSON.parse(roomDataStr);

      // Check if room is full
      if (roomData.blackPlayer && roomData.blackPlayer !== userId) {
        socket.emit('error', { message: 'Room is full', code: 'ROOM_FULL' });
        return;
      }

      // Assign color
      const isWhite = roomData.whitePlayer === userId;
      const isBlack = !isWhite && !roomData.blackPlayer;

      if (isBlack) {
        roomData.blackPlayer = userId;
        roomData.status = 'active';
      }

      socket.join(actualRoomId);
      socket.data.roomId = actualRoomId;
      socket.data.color = isWhite ? 'white' : 'black';

      // Update room in Redis
      await safeRedisSetEx(
        REDIS_KEYS.CHESS_ROOM(actualRoomId), 
        3600, 
        JSON.stringify(roomData)
      );

      // Notify both players
      playAlongNamespace.to(actualRoomId).emit('game_start', {
        roomId: actualRoomId,
        ...roomData
      });

      console.log(`[PLAY-ALONG] ✅ User ${userId} joined room ${actualRoomId} as ${socket.data.color}`);
    } catch (error) {
      console.error('[PLAY-ALONG] ❌ Error joining room:', error);
      socket.emit('error', { 
        message: 'Failed to join room',
        code: 'JOIN_ERROR'
      });
    }
  });

  // Make move
  socket.on('make_move', async ({ roomId, from, to, promotion }) => {
    try {
      if (!redisReady) {
        socket.emit('error', { message: 'Server not ready', code: 'REDIS_NOT_READY' });
        return;
      }

      if (!socket.data.roomId || socket.data.roomId !== roomId) {
        socket.emit('error', { message: 'Not in this room', code: 'NOT_IN_ROOM' });
        return;
      }

      const roomDataStr = await safeRedisGet(REDIS_KEYS.CHESS_ROOM(roomId));
      if (!roomDataStr) {
        socket.emit('error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
        return;
      }

      const roomData = JSON.parse(roomDataStr);
      const game = new Chess(roomData.fen);

      // Validate turn
      const expectedColor = roomData.turn === 'white' ? 'w' : 'b';
      const playerColor = socket.data.color === 'white' ? 'w' : 'b';
      
      if (expectedColor !== playerColor) {
        socket.emit('error', { message: 'Not your turn', code: 'NOT_YOUR_TURN' });
        return;
      }

      // Validate move
      const move = game.move({ from, to, promotion });
      if (!move) {
        socket.emit('error', { message: 'Invalid move', code: 'INVALID_MOVE' });
        return;
      }

      // Update game state
      roomData.fen = game.fen();
      roomData.turn = game.turn() === 'w' ? 'white' : 'black';

      // Check game status
      if (game.isCheckmate()) {
        roomData.status = 'finished';
        roomData.winner = socket.data.color;
      } else if (game.isStalemate() || game.isDraw()) {
        roomData.status = 'finished';
        roomData.winner = 'draw';
      }

      // Save to Redis
      await safeRedisSetEx(
        REDIS_KEYS.CHESS_ROOM(roomId), 
        3600, 
        JSON.stringify(roomData)
      );

      // Broadcast to all players in room
      playAlongNamespace.to(roomId).emit('move_update', {
        roomId,
        from,
        to,
        promotion,
        fen: roomData.fen,
        turn: roomData.turn,
        status: roomData.status,
        winner: roomData.winner,
      });

      if (roomData.status === 'finished') {
        playAlongNamespace.to(roomId).emit('game_over', {
          roomId,
          winner: roomData.winner,
        });
      }

      console.log(`[PLAY-ALONG] ✅ Move ${from}-${to} in room ${roomId}`);
    } catch (error) {
      console.error('[PLAY-ALONG] ❌ Error making move:', error);
      socket.emit('error', { 
        message: 'Failed to make move',
        code: 'MOVE_ERROR'
      });
    }
  });

  // Resign
  socket.on('resign', async ({ roomId }) => {
    try {
      if (!redisReady) return;

      const roomDataStr = await safeRedisGet(REDIS_KEYS.CHESS_ROOM(roomId));
      if (roomDataStr) {
        const roomData = JSON.parse(roomDataStr);
        roomData.status = 'finished';
        roomData.winner = socket.data.color === 'white' ? 'black' : 'white';
        
        await safeRedisSetEx(
          REDIS_KEYS.CHESS_ROOM(roomId), 
          3600, 
          JSON.stringify(roomData)
        );

        playAlongNamespace.to(roomId).emit('game_over', {
          roomId,
          winner: roomData.winner,
        });
      }
    } catch (error) {
      console.error('[PLAY-ALONG] ❌ Error resigning:', error);
    }
  });

  // Disconnect
  socket.on('disconnect', async (reason) => {
    const roomId = socket.data.roomId;
    if (roomId) {
      console.log(`[PLAY-ALONG] ❌ User ${userId} disconnected from room ${roomId}: ${reason}`);
      
      // Notify other players
      socket.to(roomId).emit('opponent_left', { userId, roomId });
      
      // Clean up if needed (optional - rooms expire in Redis)
    }
  });
});

// ====================================
// SERVER STARTUP (Non-Blocking)
// ====================================
const PORT = process.env.ENGAGE_PORT || 3002;

// Connection monitoring
let connectionCount = 0;
io.engine.on('connection', (socket) => {
  connectionCount++;
  if (connectionCount % 100 === 0) {
    console.log(`[MONITOR] Active connections: ${connectionCount}`);
  }
  
  socket.on('close', () => {
    connectionCount--;
  });
});

// Start server IMMEDIATELY - don't wait for Redis
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 ENGAGE Socket.IO Server Running`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Port: ${PORT}`);
  console.log(`Host: 0.0.0.0 (all interfaces)`);
  console.log(`Max Connections: ${server.maxConnections}`);
  console.log(`Redis Status: ${redisReady ? '✅ Connected' : '⚠️  Connecting...'}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`Namespaces:`);
  console.log(`  - /play-along (Real-time Chess)`);
  console.log(`  - /watch-along (YouTube sync)`);
  console.log(`  - /sing-along (Karaoke)`);
  console.log(`${'='.repeat(50)}\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[SERVER] SIGTERM received, shutting down...');
  if (redisClient) await redisClient.quit().catch(() => {});
  if (redisSubscriber) await redisSubscriber.quit().catch(() => {});
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('\n[SERVER] SIGINT received, shutting down...');
  if (redisClient) await redisClient.quit().catch(() => {});
  if (redisSubscriber) await redisSubscriber.quit().catch(() => {});
  server.close(() => process.exit(0));
});

