/**
 * ENGAGE Feature - Socket.IO Server
 * 
 * Handles:
 * - Watch Along (YouTube sync)
 * - Play Along (Real-time Chess)
 * - Sing Along (Phase 1: same as Watch Along)
 * 
 * Architecture:
 * - Separate Socket.IO namespaces for each feature
 * - Redis for room state (ephemeral)
 * - No database for realtime state
 * - Auth required (checked via token)
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

// CORS middleware - must be before routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  credentials: true,
}));

// Handle preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id');
  res.sendStatus(200);
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    server: 'Engage Socket.IO Server',
    port: process.env.ENGAGE_PORT || 3002,
    redis: redisClient?.isReady ? 'connected' : 'disconnected'
  });
});

// Socket.IO health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    namespaces: ['/watch-along', '/play-along', '/sing-along'],
    redis: redisClient?.isReady ? 'connected' : 'disconnected'
  });
});

// Socket.IO polling endpoint test (for debugging)
app.get('/socket.io-test', (req, res) => {
  res.json({ 
    message: 'Socket.IO server is running',
    namespaces: ['/watch-along', '/play-along', '/sing-along'],
    transports: ['websocket', 'polling']
  });
});

// ====================================
// REST API ENDPOINTS (Alternative to Socket.IO)
// ====================================
app.use(express.json());

// Handle direct access to Socket.IO namespaces (return helpful message)
app.get('/play-along', (req, res) => {
  res.json({
    message: 'This is a Socket.IO namespace, not a REST endpoint',
    info: 'Use REST API endpoints instead:',
    endpoints: {
      create: 'POST /api/chess/create',
      join: 'POST /api/chess/join',
      status: 'GET /api/chess/room/:roomId'
    }
  });
});

// Create chess room (REST API) - SIMPLIFIED & ROBUST
app.post('/api/chess/create', async (req, res) => {
  try {
    console.log('[REST API] Creating chess room...');
    const userId = req.body.userId || req.headers['x-user-id'] || `user_${Date.now()}`;
    
    // Generate room ID (simple, no dependencies)
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Generate 6-digit room code (simple, no Redis dependency)
    let roomCode = '';
    for (let i = 0; i < 6; i++) {
      roomCode += Math.floor(Math.random() * 10).toString();
    }
    
    // Create chess game (with error handling)
    let initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; // Default starting position
    try {
      const game = new Chess();
      initialFen = game.fen();
    } catch (chessError) {
      console.warn('[REST API] ⚠️ Chess.js error, using default FEN:', chessError.message);
      // Continue with default FEN
    }
    
    const roomData = {
      roomId,
      roomCode,
      whitePlayer: userId,
      blackPlayer: null,
      fen: initialFen,
      turn: 'white',
      status: 'waiting',
      winner: null,
      createdAt: new Date().toISOString(),
    };

    // Store in Redis if available (non-blocking)
    let storedInRedis = false;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`chess:room:${roomId}`, 3600, JSON.stringify(roomData));
        await redisClient.setEx(`chess:code:${roomCode}`, 3600, roomId);
        storedInRedis = true;
        console.log(`[REST API] ✅ Room stored in Redis: ${roomId}`);
      } catch (redisError) {
        // Suppress NOAUTH errors (expected if Redis requires password)
        const errorMsg = redisError.message || '';
        if (!errorMsg.includes('NOAUTH') && !errorMsg.includes('Authentication')) {
          console.warn('[REST API] ⚠️ Redis storage failed, but room created:', errorMsg);
        }
        // Continue anyway - room is still created
      }
    }
    
    // ALWAYS store in memory cache as fallback
    roomCache.set(roomId, roomData);
    roomCodeCache.set(roomCode, roomId);
    console.log(`[REST API] ✅ Room stored in memory cache: ${roomId}${storedInRedis ? ' (also in Redis)' : ' (Redis unavailable)'}`);

    console.log(`[REST API] ✅ Chess room created: ${roomId} (Code: ${roomCode}) by ${userId}`);
    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error creating chess room:', error);
    console.error('[REST API] Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create game room',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Join chess room (REST API) - SIMPLIFIED
app.post('/api/chess/join', async (req, res) => {
  try {
    console.log('[REST API] 📥 Join request received:', { body: req.body, headers: req.headers });
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomCode, roomId } = req.body;
    
    console.log('[REST API] Join params:', { userId, roomCode, roomId });

    let actualRoomId = roomId;

    // If roomCode provided, look up roomId from Redis or memory cache
    if (!actualRoomId && roomCode) {
      const normalizedCode = roomCode.trim();
      
      // First try Redis
      if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
        try {
          actualRoomId = await redisClient.get(`chess:code:${normalizedCode}`);
        } catch (redisError) {
          // Suppress auth errors, but log others
          if (!redisError.message?.includes('NOAUTH') && !redisError.message?.includes('ECONNREFUSED')) {
            console.warn('[REST API] ⚠️ Redis lookup failed:', redisError.message);
          }
        }
      }
      
      // If not in Redis, try memory cache
      if (!actualRoomId && roomCodeCache) {
        actualRoomId = roomCodeCache.get(normalizedCode);
        if (actualRoomId) {
          console.log(`[REST API] ✅ Found room code in memory cache: ${normalizedCode} -> ${actualRoomId}`);
        } else {
          console.log(`[REST API] ❌ Room code not found in memory cache: ${normalizedCode}`);
          console.log(`[REST API] Memory cache size: ${roomCodeCache.size} codes, ${roomCache.size} rooms`);
          // Log all room codes in cache for debugging
          if (roomCodeCache.size > 0) {
            console.log(`[REST API] Available room codes:`, Array.from(roomCodeCache.keys()).slice(0, 10));
          }
        }
      }
      
      if (!actualRoomId) {
        console.log(`[REST API] ❌ Room code lookup failed: ${normalizedCode}`);
        return res.status(404).json({ success: false, error: 'Invalid room code. Room may have expired or Redis is unavailable.' });
      }
    }

    if (!actualRoomId) {
      return res.status(400).json({ success: false, error: 'Room ID or code is required' });
    }

    // Get room data from Redis or memory cache
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`chess:room:${actualRoomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // If not in Redis, try memory cache
    if (!roomDataStr) {
      const cachedRoom = roomCache.get(actualRoomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found. It may have expired.' });
    }

    let roomData;
    try {
      roomData = JSON.parse(roomDataStr);
    } catch (parseError) {
      console.error('[REST API] ❌ Failed to parse room data:', parseError);
      return res.status(500).json({ success: false, error: 'Invalid room data' });
    }
    
    // Check if user is already in the room
    if (roomData.whitePlayer === userId) {
      return res.json({ success: true, ...roomData, isRejoin: true });
    }
    
    if (roomData.blackPlayer) {
      if (roomData.blackPlayer === userId) {
        return res.json({ success: true, ...roomData, isRejoin: true });
      } else {
        return res.status(403).json({ success: false, error: 'Room is full' });
      }
    }

    // Assign black player
    roomData.blackPlayer = userId;
    roomData.status = 'active';
    
    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`chess:room:${actualRoomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress NOAUTH errors (expected if Redis requires password)
        const errorMsg = redisError.message || '';
        if (!errorMsg.includes('NOAUTH') && !errorMsg.includes('Authentication')) {
          console.warn('[REST API] ⚠️ Redis update failed:', errorMsg);
        }
        // Continue anyway - room state updated in memory
      }
    }
    
    // ALWAYS update memory cache
    roomCache.set(actualRoomId, roomData);
    if (roomData.roomCode) {
      roomCodeCache.set(roomData.roomCode, actualRoomId);
    }

    console.log(`[REST API] ✅ User ${userId} joined room ${actualRoomId} (black) - Code: ${roomData.roomCode}`);
    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error joining chess room:', error);
    console.error('[REST API] Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to join game room',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get room status (REST API) - SIMPLIFIED & ROBUST
app.get('/api/chess/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    console.log(`[REST API] Getting room status for: ${roomId}`);
    
    if (!roomId || roomId.trim() === '') {
      return res.status(400).json({ success: false, error: 'Room ID is required' });
    }
    
    let roomDataStr = null;
    
    // Try to get from Redis (with auth error handling)
    if (redisClient) {
      try {
        // Check if Redis is ready
        const isReady = typeof redisClient.isReady === 'function' 
          ? redisClient.isReady() 
          : (redisClient.isReady === true);
        
        if (isReady) {
          roomDataStr = await redisClient.get(`chess:room:${roomId}`);
          if (roomDataStr) {
            console.log(`[REST API] ✅ Found room in Redis: ${roomId}`);
          }
        } else {
          // Redis not ready - don't log every time (too noisy)
        }
      } catch (redisError) {
        // Don't spam logs with auth errors - only log once per minute
        const errorMsg = redisError.message || '';
        if (errorMsg.includes('NOAUTH') || errorMsg.includes('Authentication')) {
          // Auth error - Redis needs password but we don't have it configured
          // Silently fail - room won't be found in Redis
        } else {
          // Other errors - log once
          console.warn(`[REST API] ⚠️ Redis get failed for ${roomId}:`, errorMsg);
        }
        // Continue - room might not be in Redis
      }
    }
    
    // If not found in Redis, try memory cache
    if (!roomDataStr) {
      const cachedRoom = roomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
        console.log(`[REST API] ✅ Found room in memory cache: ${roomId}`);
      }
    }
    
    // If still not found, return 404
    if (!roomDataStr) {
      console.log(`[REST API] ❌ Room not found: ${roomId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Room not found. It may have expired.' 
      });
    }

    // Parse room data
    let roomData;
    try {
      roomData = JSON.parse(roomDataStr);
      console.log(`[REST API] ✅ Room data parsed successfully: ${roomId}`);
    } catch (parseError) {
      console.error(`[REST API] ❌ Failed to parse room data for ${roomId}:`, parseError);
      return res.status(500).json({ 
        success: false, 
        error: 'Invalid room data format',
        details: parseError.message
      });
    }
    
    // Return room data
    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error(`[REST API] ❌ Error getting room status:`, error);
    console.error(`[REST API] Error stack:`, error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get room status',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Make chess move (REST API)
app.post('/api/chess/move', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, from, to, promotion } = req.body;

    if (!roomId || !from || !to) {
      return res.status(400).json({ success: false, error: 'roomId, from, and to are required' });
    }

    // Get room data from Redis or memory cache
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`chess:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // If not in Redis, try memory cache
    if (!roomDataStr) {
      const cachedRoom = roomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData;
    try {
      roomData = JSON.parse(roomDataStr);
    } catch (parseError) {
      return res.status(500).json({ success: false, error: 'Invalid room data format' });
    }

    if (roomData.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Game is not active' });
    }

    // Check if it's user's turn
    const expectedColor = roomData.turn;
    const userColor = roomData.whitePlayer === userId ? 'white' : roomData.blackPlayer === userId ? 'black' : null;
    
    if (!userColor) {
      return res.status(403).json({ success: false, error: 'You are not a player in this room' });
    }

    if (userColor !== expectedColor) {
      return res.status(400).json({ success: false, error: 'Not your turn' });
    }

    // Validate move using chess.js
    let game;
    try {
      game = new Chess(roomData.fen);
    } catch (chessError) {
      console.error('[REST API] Chess.js initialization error:', chessError);
      return res.status(500).json({ success: false, error: 'Failed to initialize game' });
    }

    const move = { from, to };
    if (promotion) {
      move.promotion = promotion;
    }

    try {
      const result = game.move(move);
      if (!result) {
        return res.status(400).json({ success: false, error: 'Invalid move' });
      }

      // Update game state
      roomData.fen = game.fen();
      roomData.turn = game.turn() === 'w' ? 'white' : 'black';

      // Check for game end
      if (game.isCheckmate()) {
        roomData.status = 'finished';
        roomData.winner = userColor;
      } else if (game.isDraw() || game.isStalemate()) {
        roomData.status = 'finished';
        roomData.winner = 'draw';
      }

      // Update Redis if available
      if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
        try {
          await redisClient.setEx(`chess:room:${roomId}`, 3600, JSON.stringify(roomData));
        } catch (redisError) {
          // Suppress auth errors
        }
      }
      
      // ALWAYS update memory cache
      roomCache.set(roomId, roomData);

      console.log(`[REST API] ♟️ Move in room ${roomId}: ${from}→${to} by ${userColor}`);
      
      res.json({
        success: true,
        fen: roomData.fen,
        turn: roomData.turn,
        status: roomData.status,
        winner: roomData.winner,
        move: { from, to, promotion },
      });
    } catch (error) {
      console.error(`[REST API] ❌ Invalid move:`, error);
      return res.status(400).json({ success: false, error: 'Invalid move: ' + error.message });
    }
  } catch (error) {
    console.error('[REST API] ❌ Error making move:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to make move',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ====================================
// WATCH ALONG REST API ENDPOINTS
// ====================================

// In-memory cache for Watch Along rooms (fallback when Redis unavailable)
const watchRoomCache = new Map(); // roomId -> roomData
const watchRoomCodeCache = new Map(); // roomCode -> roomId

// Generate 6-digit room code for Watch Along
async function generateWatchRoomCode() {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Check Redis first
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        const existing = await redisClient.get(`watchalong:code:${code}`);
        if (!existing) {
          return code;
        }
      } catch (redisError) {
        // Suppress errors
      }
    }
    
    // Check memory cache
    if (!watchRoomCodeCache.has(code)) {
      return code;
    }
    
    attempts++;
  }
  
  return Date.now().toString().slice(-6);
}

// Create Watch Along room (REST API)
app.post('/api/watch/create', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { videoId, videoUrl } = req.body;

    if (!videoId || !videoUrl) {
      return res.status(400).json({ success: false, error: 'videoId and videoUrl are required' });
    }

    const roomId = generateRoomId();
    const roomCode = await generateWatchRoomCode();
    
    const roomData = {
      roomId,
      roomCode,
      hostId: userId,
      videoId,
      videoUrl,
      isPlaying: false,
      currentTime: 0,
      createdAt: new Date().toISOString(),
      participants: [userId],
      status: 'active',
    };

    // Store in Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`watchalong:room:${roomId}`, 3600, JSON.stringify(roomData));
        await redisClient.setEx(`watchalong:code:${roomCode}`, 3600, roomId);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    watchRoomCache.set(roomId, roomData);
    watchRoomCodeCache.set(roomCode, roomId);

    console.log(`[REST API] ✅ Watch Along room created: ${roomId} (Code: ${roomCode})`);
    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error creating Watch Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create room',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Join Watch Along room (REST API)
app.post('/api/watch/join', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomCode, roomId } = req.body;

    let actualRoomId = roomId;

    // If roomCode provided, look up roomId from Redis or memory cache
    if (!actualRoomId && roomCode) {
      const normalizedCode = roomCode.trim();
      let foundRoomId = null;

      // Try Redis first
      if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
        try {
          foundRoomId = await redisClient.get(`watchalong:code:${normalizedCode}`);
          if (foundRoomId) {
            console.log(`[REST API] ✅ Found Watch Along room code ${normalizedCode} in Redis, roomId: ${foundRoomId}`);
          }
        } catch (redisError) {
          console.warn('[REST API] ⚠️ Redis lookup failed for Watch Along room code:', redisError.message);
        }
      }

      // If not found in Redis, try memory cache
      if (!foundRoomId) {
        foundRoomId = watchRoomCodeCache.get(normalizedCode);
        if (foundRoomId) {
          console.log(`[REST API] ✅ Found Watch Along room code ${normalizedCode} in memory cache, roomId: ${foundRoomId}`);
        }
      }

      if (!foundRoomId) {
        return res.status(404).json({ success: false, error: 'Invalid room code. Room may have expired or Redis is unavailable.' });
      }
      actualRoomId = foundRoomId;
    }

    if (!actualRoomId) {
      return res.status(400).json({ success: false, error: 'roomId or roomCode is required' });
    }

    // Get room data from Redis or memory cache
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`watchalong:room:${actualRoomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // If not in Redis, try memory cache
    if (!roomDataStr) {
      const cachedRoom = watchRoomCache.get(actualRoomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData;
    try {
      roomData = JSON.parse(roomDataStr);
    } catch (parseError) {
      return res.status(500).json({ success: false, error: 'Invalid room data format' });
    }

    // Add user to participants if not already there
    if (!roomData.participants.includes(userId)) {
      roomData.participants.push(userId);
    }

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`watchalong:room:${actualRoomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    watchRoomCache.set(actualRoomId, roomData);

    console.log(`[REST API] ✅ User ${userId} joined Watch Along room ${actualRoomId}`);
    res.json({ 
      success: true, 
      ...roomData,
      isHost: roomData.hostId === userId,
    });
  } catch (error) {
    console.error('[REST API] ❌ Error joining Watch Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to join room',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get Watch Along room status (REST API)
app.get('/api/watch/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    // Get room data from Redis or memory cache
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`watchalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // If not in Redis, try memory cache
    if (!roomDataStr) {
      const cachedRoom = watchRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData;
    try {
      roomData = JSON.parse(roomDataStr);
    } catch (parseError) {
      return res.status(500).json({ success: false, error: 'Invalid room data format' });
    }

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error getting Watch Along room status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get room status',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Control playback (REST API) - Play
app.post('/api/watch/play', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, currentTime } = req.body;

    if (!roomId) {
      return res.status(400).json({ success: false, error: 'roomId is required' });
    }

    // Get room data
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`watchalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    if (!roomDataStr) {
      const cachedRoom = watchRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData = JSON.parse(roomDataStr);
    
    // Check if user is host
    if (roomData.hostId !== userId) {
      return res.status(403).json({ success: false, error: 'Only host can control playback' });
    }

    // Update room state
    roomData.isPlaying = true;
    roomData.currentTime = currentTime !== undefined ? currentTime : (roomData.currentTime || 0);

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`watchalong:room:${roomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    watchRoomCache.set(roomId, roomData);

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error playing Watch Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to play',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Control playback (REST API) - Pause
app.post('/api/watch/pause', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, currentTime } = req.body;

    if (!roomId) {
      return res.status(400).json({ success: false, error: 'roomId is required' });
    }

    // Get room data
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`watchalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    if (!roomDataStr) {
      const cachedRoom = watchRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData = JSON.parse(roomDataStr);
    
    // Check if user is host
    if (roomData.hostId !== userId) {
      return res.status(403).json({ success: false, error: 'Only host can control playback' });
    }

    // Update room state
    roomData.isPlaying = false;
    roomData.currentTime = currentTime !== undefined ? currentTime : (roomData.currentTime || 0);

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`watchalong:room:${roomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    watchRoomCache.set(roomId, roomData);

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error pausing Watch Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to pause',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Control playback (REST API) - Seek
app.post('/api/watch/seek', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, currentTime } = req.body;

    if (!roomId || currentTime === undefined) {
      return res.status(400).json({ success: false, error: 'roomId and currentTime are required' });
    }

    // Get room data
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`watchalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    if (!roomDataStr) {
      const cachedRoom = watchRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData = JSON.parse(roomDataStr);
    
    // Check if user is host
    if (roomData.hostId !== userId) {
      return res.status(403).json({ success: false, error: 'Only host can control playback' });
    }

    // Update room state
    roomData.currentTime = currentTime;

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`watchalong:room:${roomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    watchRoomCache.set(roomId, roomData);

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error seeking Watch Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to seek',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Change video (REST API)
app.post('/api/watch/change-video', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, videoId, videoUrl } = req.body;

    if (!roomId || !videoId || !videoUrl) {
      return res.status(400).json({ success: false, error: 'roomId, videoId, and videoUrl are required' });
    }

    // Get room data
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`watchalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    if (!roomDataStr) {
      const cachedRoom = watchRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData = JSON.parse(roomDataStr);
    
    // Check if user is host
    if (roomData.hostId !== userId) {
      return res.status(403).json({ success: false, error: 'Only host can change video' });
    }

    // Update room state
    roomData.videoId = videoId;
    roomData.videoUrl = videoUrl;
    roomData.currentTime = 0;
    roomData.isPlaying = false;

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`watchalong:room:${roomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    watchRoomCache.set(roomId, roomData);

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error changing Watch Along video:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to change video',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ====================================
// SING ALONG REST API ENDPOINTS
// ====================================

// In-memory cache for Sing Along rooms (fallback when Redis unavailable)
const singRoomCache = new Map(); // roomId -> roomData
const singRoomCodeCache = new Map(); // roomCode -> roomId

// Generate 6-digit room code for Sing Along
async function generateSingRoomCode() {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Check Redis first
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        const existing = await redisClient.get(`singalong:code:${code}`);
        if (!existing) {
          return code;
        }
      } catch (redisError) {
        // Suppress errors
      }
    }
    
    // Check memory cache
    if (!singRoomCodeCache.has(code)) {
      return code;
    }
    
    attempts++;
  }
  
  return Date.now().toString().slice(-6);
}

// Create Sing Along room (REST API)
app.post('/api/sing/create', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { videoId, videoUrl } = req.body;

    if (!videoId || !videoUrl) {
      return res.status(400).json({ success: false, error: 'videoId and videoUrl are required' });
    }

    const roomId = generateRoomId();
    const roomCode = await generateSingRoomCode();
    
    const roomData = {
      roomId,
      roomCode,
      hostId: userId,
      videoId,
      videoUrl,
      isPlaying: false,
      currentTime: 0,
      createdAt: new Date().toISOString(),
      participants: [userId],
      status: 'active',
    };

    // Store in Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`singalong:room:${roomId}`, 3600, JSON.stringify(roomData));
        await redisClient.setEx(`singalong:code:${roomCode}`, 3600, roomId);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    singRoomCache.set(roomId, roomData);
    singRoomCodeCache.set(roomCode, roomId);

    console.log(`[REST API] ✅ Sing Along room created: ${roomId} (Code: ${roomCode})`);
    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error creating Sing Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create room',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Join Sing Along room (REST API)
app.post('/api/sing/join', async (req, res) => {
  try {
    console.log('[REST API] 📥 Sing Along join request received:', { body: req.body, headers: req.headers });
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomCode, roomId } = req.body;
    
    console.log('[REST API] Sing Along join params:', { userId, roomCode, roomId });

    let actualRoomId = roomId;

    // If roomCode provided, look up roomId from Redis or memory cache
    if (!actualRoomId && roomCode) {
      const normalizedCode = roomCode.trim();
      let foundRoomId = null;

      // Try Redis first
      if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
        try {
          foundRoomId = await redisClient.get(`singalong:code:${normalizedCode}`);
          if (foundRoomId) {
            console.log(`[REST API] ✅ Found Sing Along room code ${normalizedCode} in Redis, roomId: ${foundRoomId}`);
          }
        } catch (redisError) {
          console.warn('[REST API] ⚠️ Redis lookup failed for Sing Along room code:', redisError.message);
        }
      }

      // If not found in Redis, try memory cache
      if (!foundRoomId) {
        foundRoomId = singRoomCodeCache.get(normalizedCode);
        if (foundRoomId) {
          console.log(`[REST API] ✅ Found Sing Along room code ${normalizedCode} in memory cache, roomId: ${foundRoomId}`);
        }
      }

      if (!foundRoomId) {
        console.log(`[REST API] ❌ Sing Along room code lookup failed: ${normalizedCode}`);
        return res.status(404).json({ success: false, error: 'Invalid room code. Room may have expired or Redis is unavailable.' });
      }
      actualRoomId = foundRoomId;
    }

    if (!actualRoomId) {
      return res.status(400).json({ success: false, error: 'roomId or roomCode is required' });
    }

    // Get room data from Redis or memory cache
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`singalong:room:${actualRoomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // If not in Redis, try memory cache
    if (!roomDataStr) {
      const cachedRoom = singRoomCache.get(actualRoomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData;
    try {
      roomData = JSON.parse(roomDataStr);
    } catch (parseError) {
      return res.status(500).json({ success: false, error: 'Invalid room data format' });
    }

    // Add user to participants if not already there
    if (!roomData.participants.includes(userId)) {
      roomData.participants.push(userId);
    }

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`singalong:room:${actualRoomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    singRoomCache.set(actualRoomId, roomData);

    console.log(`[REST API] ✅ User ${userId} joined Sing Along room ${actualRoomId}`);
    res.json({ 
      success: true, 
      ...roomData,
      isHost: roomData.hostId === userId,
    });
  } catch (error) {
    console.error('[REST API] ❌ Error joining Sing Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to join room',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get Sing Along room status (REST API)
app.get('/api/sing/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    console.log(`[REST API] Getting Sing Along room status for: ${roomId}`);

    // Get room data from Redis or memory cache
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`singalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // If not in Redis, try memory cache
    if (!roomDataStr) {
      const cachedRoom = singRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData;
    try {
      roomData = JSON.parse(roomDataStr);
    } catch (parseError) {
      return res.status(500).json({ success: false, error: 'Invalid room data format' });
    }

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error getting Sing Along room status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get room status',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Control playback (REST API) - Play
app.post('/api/sing/play', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, currentTime } = req.body;

    if (!roomId) {
      return res.status(400).json({ success: false, error: 'roomId is required' });
    }

    // Get room data
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`singalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    if (!roomDataStr) {
      const cachedRoom = singRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData = JSON.parse(roomDataStr);
    
    // Check if user is host
    if (roomData.hostId !== userId) {
      return res.status(403).json({ success: false, error: 'Only host can control playback' });
    }

    // Update room state
    roomData.isPlaying = true;
    roomData.currentTime = currentTime !== undefined ? currentTime : (roomData.currentTime || 0);

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`singalong:room:${roomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    singRoomCache.set(roomId, roomData);

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error playing Sing Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to play',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Control playback (REST API) - Pause
app.post('/api/sing/pause', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, currentTime } = req.body;

    if (!roomId) {
      return res.status(400).json({ success: false, error: 'roomId is required' });
    }

    // Get room data
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`singalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    if (!roomDataStr) {
      const cachedRoom = singRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData = JSON.parse(roomDataStr);
    
    // Check if user is host
    if (roomData.hostId !== userId) {
      return res.status(403).json({ success: false, error: 'Only host can control playback' });
    }

    // Update room state
    roomData.isPlaying = false;
    roomData.currentTime = currentTime !== undefined ? currentTime : (roomData.currentTime || 0);

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`singalong:room:${roomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    singRoomCache.set(roomId, roomData);

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error pausing Sing Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to pause',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Control playback (REST API) - Seek
app.post('/api/sing/seek', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, currentTime } = req.body;

    if (!roomId || currentTime === undefined) {
      return res.status(400).json({ success: false, error: 'roomId and currentTime are required' });
    }

    // Get room data
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`singalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    if (!roomDataStr) {
      const cachedRoom = singRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData = JSON.parse(roomDataStr);
    
    // Check if user is host
    if (roomData.hostId !== userId) {
      return res.status(403).json({ success: false, error: 'Only host can control playback' });
    }

    // Update room state
    roomData.currentTime = currentTime;

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`singalong:room:${roomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    singRoomCache.set(roomId, roomData);

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error seeking Sing Along room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to seek',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Change video (REST API)
app.post('/api/sing/change-video', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
    const { roomId, videoId, videoUrl } = req.body;

    if (!roomId || !videoId || !videoUrl) {
      return res.status(400).json({ success: false, error: 'roomId, videoId, and videoUrl are required' });
    }

    // Get room data
    let roomDataStr = null;
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        roomDataStr = await redisClient.get(`singalong:room:${roomId}`);
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    if (!roomDataStr) {
      const cachedRoom = singRoomCache.get(roomId);
      if (cachedRoom) {
        roomDataStr = JSON.stringify(cachedRoom);
      }
    }
    
    if (!roomDataStr) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    let roomData = JSON.parse(roomDataStr);
    
    // Check if user is host
    if (roomData.hostId !== userId) {
      return res.status(403).json({ success: false, error: 'Only host can change video' });
    }

    // Update room state
    roomData.videoId = videoId;
    roomData.videoUrl = videoUrl;
    roomData.currentTime = 0;
    roomData.isPlaying = false;

    // Update Redis if available
    if (redisClient && typeof redisClient.isReady === 'function' && redisClient.isReady()) {
      try {
        await redisClient.setEx(`singalong:room:${roomId}`, 3600, JSON.stringify(roomData));
      } catch (redisError) {
        // Suppress auth errors
      }
    }
    
    // ALWAYS update memory cache
    singRoomCache.set(roomId, roomData);

    res.json({ success: true, ...roomData });
  } catch (error) {
    console.error('[REST API] ❌ Error changing Sing Along video:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to change video',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ====================================
// IN-MEMORY ROOM CACHE (Fallback when Redis unavailable)
// ====================================
const roomCache = new Map(); // roomId -> roomData
const roomCodeCache = new Map(); // roomCode -> roomId

// Clean up expired rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [roomId, roomData] of roomCache.entries()) {
    const createdAt = new Date(roomData.createdAt).getTime();
    const age = now - createdAt;
    // Remove rooms older than 1 hour
    if (age > 3600000) {
      roomCache.delete(roomId);
      if (roomData.roomCode) {
        roomCodeCache.delete(roomData.roomCode);
      }
    }
  }
}, 300000); // 5 minutes

const server = http.createServer(app);

// Optimize server for high concurrency
server.maxConnections = 2000; // Allow up to 2000 concurrent connections
server.keepAliveTimeout = 65000; // Keep connections alive
server.headersTimeout = 66000; // Slightly higher than keepAliveTimeout

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Support both transports (client can choose)
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  // Better WebSocket support
  perMessageDeflation: false,
  // Optimized for 1000+ concurrent users
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  // Performance optimizations
  perMessageDeflation: false, // Disable compression for lower CPU usage
  maxHttpBufferSize: 1e6, // 1MB max message size
  // Connection limits
  allowEIO3: true, // Backward compatibility
});

// ====================================
// REDIS SETUP (Optimized for 1000+ concurrent users)
// ====================================
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined, // Add password if configured
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
  // Connection pool settings for high concurrency
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
});

redisClient.on('error', (err) => {
  console.error('[REDIS] Connection error:', err);
});

redisClient.on('connect', () => {
  console.log('[REDIS] Connected successfully');
});

redisClient.on('ready', () => {
  console.log('[REDIS] ✅ Ready to accept commands');
});

redisClient.on('reconnecting', () => {
  console.log('[REDIS] Reconnecting...');
});

// Connect Redis asynchronously - don't block server startup
(async () => {
  try {
    await redisClient.connect();
    console.log('[REDIS] ✅ Connected to Redis');
  } catch (error) {
    console.error('[REDIS] ❌ Failed to connect:', error.message);
    console.error('[REDIS] ⚠️  Server will continue but features will be limited');
    console.error('[REDIS] 💡 To fix:');
    console.error('[REDIS]    1. Start Docker Desktop');
    console.error('[REDIS]    2. Run: docker run -d -p 6379:6379 --name redis-skipon redis:latest');
    console.error('[REDIS]    3. Or install Redis for Windows');
    console.error('[REDIS] 🔄 Server will auto-reconnect when Redis becomes available.');
  }
})();

// ====================================
// REDIS KEY PATTERNS
// ====================================
const REDIS_KEYS = {
  WATCH_ROOM: (roomId) => `watchalong:room:${roomId}`,
  WATCH_CODE: (code) => `watchalong:code:${code}`, // Mapping: code -> roomId
  CHESS_ROOM: (roomId) => `chess:room:${roomId}`,
  CHESS_CODE: (code) => `chess:code:${code}`, // Mapping: code -> roomId
  SING_ROOM: (roomId) => `singalong:room:${roomId}`, // Phase 1: same as watch
  SING_CODE: (code) => `singalong:code:${code}`, // Mapping: code -> roomId
};

// ====================================
// HELPER FUNCTIONS
// ====================================

/**
 * Generate unique room ID
 * Format: room_timestamp_randomString
 */
function generateRoomId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `room_${timestamp}_${random}`;
}

/**
 * Generate a unique 6-digit numeric room code
 * Retries if code already exists
 */
async function generateRoomCode() {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Generate 6-digit code (100000 to 999999)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Check if code already exists
    const existingRoomId = await redisClient.get(REDIS_KEYS.CHESS_CODE(code));
    if (!existingRoomId) {
      return code;
    }
    
    attempts++;
  }
  
  // Fallback: use timestamp-based code if all attempts fail
  return Date.now().toString().slice(-6);
}

/**
 * Verify user is authenticated (basic check)
 * In production, verify JWT token here
 */
function isAuthenticated(socket) {
  // For now, check if user data exists
  // In production, verify JWT token from handshake
  return socket.handshake.auth?.token || socket.handshake.auth?.userId;
}

/**
 * Get user ID from socket
 */
function getUserId(socket) {
  return socket.handshake.auth?.userId || socket.handshake.auth?.token || socket.id;
}

// ====================================
// WATCH ALONG NAMESPACE
// ====================================
const watchAlongNamespace = io.of('/watch-along');

watchAlongNamespace.use((socket, next) => {
  // Auth check - reject guests
  if (!isAuthenticated(socket)) {
    console.log(`[WATCH-ALONG] ❌ Unauthenticated connection attempt from ${socket.id}`);
    return next(new Error('Authentication required'));
  }
  next();
});

watchAlongNamespace.on('connection', (socket) => {
  const userId = getUserId(socket);
  console.log(`[WATCH-ALONG] ✅ User ${userId} connected (socket: ${socket.id})`);

  // Create watch room
  socket.on('create_watch_room', async ({ videoId, videoUrl }) => {
    if (!videoId || !videoUrl) {
      socket.emit('error', { message: 'videoId and videoUrl are required' });
      return;
    }

    const roomId = generateRoomId();
    const roomData = {
      roomId,
      hostId: userId,
      videoId,
      videoUrl,
      isPlaying: false,
      currentTime: 0,
      createdAt: new Date().toISOString(),
      participants: [userId],
    };

    // Store in Redis (TTL: 1 hour)
    await redisClient.setEx(REDIS_KEYS.WATCH_ROOM(roomId), 3600, JSON.stringify(roomData));
    
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.isHost = true;

    console.log(`[WATCH-ALONG] ✅ Room ${roomId} created by ${userId}`);
    socket.emit('room_created', { roomId, ...roomData });
  });

  // Join watch room
  socket.on('join_watch_room', async ({ roomId }) => {
    if (!roomId) {
      socket.emit('error', { message: 'roomId is required' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.WATCH_ROOM(roomId));
    if (!roomDataStr) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const roomData = JSON.parse(roomDataStr);
    
    // Add participant
    if (!roomData.participants.includes(userId)) {
      roomData.participants.push(userId);
      await redisClient.setEx(REDIS_KEYS.WATCH_ROOM(roomId), 3600, JSON.stringify(roomData));
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.isHost = roomData.hostId === userId;

    console.log(`[WATCH-ALONG] ✅ User ${userId} joined room ${roomId} (host: ${socket.data.isHost})`);
    
    // Send current state to new participant
    socket.emit('room_joined', {
      roomId,
      ...roomData,
      isHost: socket.data.isHost,
    });

    // Notify others
    socket.to(roomId).emit('participant_joined', { userId, roomId });
  });

  // Play (only host can control)
  socket.on('play', async ({ roomId, currentTime }) => {
    if (!socket.data.isHost) {
      socket.emit('error', { message: 'Only host can control playback' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.WATCH_ROOM(roomId));
    if (!roomDataStr) return;

    const roomData = JSON.parse(roomDataStr);
    roomData.isPlaying = true;
    roomData.currentTime = currentTime || 0;
    await redisClient.setEx(REDIS_KEYS.WATCH_ROOM(roomId), 3600, JSON.stringify(roomData));

    console.log(`[WATCH-ALONG] ▶️ Play in room ${roomId} at ${currentTime}s`);
    watchAlongNamespace.to(roomId).emit('sync_play', { currentTime: roomData.currentTime });
  });

  // Pause (only host can control)
  socket.on('pause', async ({ roomId, currentTime }) => {
    if (!socket.data.isHost) {
      socket.emit('error', { message: 'Only host can control playback' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.WATCH_ROOM(roomId));
    if (!roomDataStr) return;

    const roomData = JSON.parse(roomDataStr);
    roomData.isPlaying = false;
    roomData.currentTime = currentTime || 0;
    await redisClient.setEx(REDIS_KEYS.WATCH_ROOM(roomId), 3600, JSON.stringify(roomData));

    console.log(`[WATCH-ALONG] ⏸️ Pause in room ${roomId} at ${currentTime}s`);
    watchAlongNamespace.to(roomId).emit('sync_pause', { currentTime: roomData.currentTime });
  });

  // Seek (only host can control)
  socket.on('seek', async ({ roomId, currentTime }) => {
    if (!socket.data.isHost) {
      socket.emit('error', { message: 'Only host can control playback' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.WATCH_ROOM(roomId));
    if (!roomDataStr) return;

    const roomData = JSON.parse(roomDataStr);
    roomData.currentTime = currentTime;
    await redisClient.setEx(REDIS_KEYS.WATCH_ROOM(roomId), 3600, JSON.stringify(roomData));

    console.log(`[WATCH-ALONG] ⏩ Seek in room ${roomId} to ${currentTime}s`);
    watchAlongNamespace.to(roomId).emit('sync_seek', { currentTime });
  });

  // Change video (only host can control)
  socket.on('change_video', async ({ roomId, videoId, videoUrl }) => {
    if (!socket.data.isHost) {
      socket.emit('error', { message: 'Only host can change video' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.WATCH_ROOM(roomId));
    if (!roomDataStr) return;

    const roomData = JSON.parse(roomDataStr);
    roomData.videoId = videoId;
    roomData.videoUrl = videoUrl;
    roomData.currentTime = 0;
    roomData.isPlaying = false;
    await redisClient.setEx(REDIS_KEYS.WATCH_ROOM(roomId), 3600, JSON.stringify(roomData));

    console.log(`[WATCH-ALONG] 🔄 Video changed in room ${roomId} to ${videoId}`);
    watchAlongNamespace.to(roomId).emit('sync_video', { videoId, videoUrl });
  });

  // Disconnect
  socket.on('disconnect', async (reason) => {
    const roomId = socket.data.roomId;
    if (roomId) {
      console.log(`[WATCH-ALONG] ❌ User ${userId} disconnected from room ${roomId}: ${reason}`);
      
      // Notify others
      socket.to(roomId).emit('participant_left', { userId, roomId });
      
      // If host left, clean up room
      if (socket.data.isHost) {
        await redisClient.del(REDIS_KEYS.WATCH_ROOM(roomId));
        console.log(`[WATCH-ALONG] 🧹 Room ${roomId} cleaned up (host left)`);
      }
    }
  });
});

// ====================================
// PLAY ALONG (CHESS) NAMESPACE
// ====================================
const playAlongNamespace = io.of('/play-along');

playAlongNamespace.use((socket, next) => {
  // ALWAYS allow connection - no auth blocking
  const hasAuth = socket.handshake.auth?.token || socket.handshake.auth?.userId;
  if (hasAuth) {
    socket.data.isAuthenticated = true;
    console.log(`[PLAY-ALONG] ✅ Authenticated connection from ${socket.id}`);
  } else {
    socket.data.isAuthenticated = false;
    console.log(`[PLAY-ALONG] ⚠️ Connection without auth from ${socket.id} - allowing anyway`);
  }
  // Always call next() to allow connection
  next();
});

playAlongNamespace.on('connection', (socket) => {
  const userId = getUserId(socket) || socket.id; // Fallback to socket.id if no userId
  const transport = socket.conn.transport.name;
  console.log(`[PLAY-ALONG] ✅ User ${userId} connected (socket: ${socket.id}, transport: ${transport})`);
  
  // IMMEDIATE acknowledgment - don't wait for anything
  // Check Redis status safely
  let redisStatus = false;
  try {
    redisStatus = redisClient && typeof redisClient.isReady === 'function' 
      ? redisClient.isReady() 
      : (redisClient?.isReady === true);
  } catch (e) {
    redisStatus = false;
  }
  
  socket.emit('server_ready', { 
    socketId: socket.id, 
    userId,
    redisReady: redisStatus,
    timestamp: Date.now()
  });
  
  // Also emit legacy 'connected' event for compatibility
  socket.emit('connected', { socketId: socket.id, userId });
  
  // Log connection details for debugging
  console.log(`[PLAY-ALONG] 📊 Connection details:`, {
    socketId: socket.id,
    userId,
    transport,
    redisReady: redisStatus,
    handshake: {
      address: socket.handshake.address,
      headers: socket.handshake.headers['user-agent']
    }
  });

  // Create chess room
  socket.on('create_chess_room', async () => {
    try {
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
        status: 'waiting', // waiting, active, finished
        winner: null,
        createdAt: new Date().toISOString(),
      };

      // Store room data
      await redisClient.setEx(REDIS_KEYS.CHESS_ROOM(roomId), 3600, JSON.stringify(roomData));
      
      // Store code -> roomId mapping
      await redisClient.setEx(REDIS_KEYS.CHESS_CODE(roomCode), 3600, roomId);
      
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.color = 'white';

      console.log(`[PLAY-ALONG] ✅ Chess room ${roomId} created by ${userId} (white) - Code: ${roomCode}`);
      socket.emit('room_created', { roomId, roomCode, ...roomData });
    } catch (error) {
      console.error('[PLAY-ALONG] ❌ Error creating chess room:', error);
      socket.emit('error', { message: 'Failed to create game room' });
    }
  });

  // Join chess room (accepts roomId or roomCode)
  socket.on('join_chess_room', async ({ roomId, roomCode }) => {
    try {
      let actualRoomId = roomId;

      // If roomCode provided, look up roomId from code mapping
      if (!actualRoomId && roomCode) {
        const normalizedCode = roomCode.trim().toUpperCase();
        actualRoomId = await redisClient.get(REDIS_KEYS.CHESS_CODE(normalizedCode));
        
        if (!actualRoomId) {
          socket.emit('error', { message: 'Invalid room code' });
          return;
        }
      }

      if (!actualRoomId) {
        socket.emit('error', { message: 'Room ID or code is required' });
        return;
      }

      const roomDataStr = await redisClient.get(REDIS_KEYS.CHESS_ROOM(actualRoomId));
      if (!roomDataStr) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const roomData = JSON.parse(roomDataStr);
      
      // Check if user is already in the room
      if (roomData.whitePlayer === userId) {
        socket.emit('error', { message: 'You are already in this room as white player' });
        return;
      }
      
      if (roomData.blackPlayer) {
        if (roomData.blackPlayer === userId) {
          // Rejoining as black player
          socket.join(actualRoomId);
          socket.data.roomId = actualRoomId;
          socket.data.color = 'black';
          socket.emit('game_start', {
            roomId: actualRoomId,
            roomCode: roomData.roomCode,
            ...roomData,
          });
          return;
        } else {
          socket.emit('error', { message: 'Room is full' });
          return;
        }
      }

      // Assign black player
      roomData.blackPlayer = userId;
      roomData.status = 'active';
      await redisClient.setEx(REDIS_KEYS.CHESS_ROOM(actualRoomId), 3600, JSON.stringify(roomData));

      socket.join(actualRoomId);
      socket.data.roomId = actualRoomId;
      socket.data.color = 'black';

      console.log(`[PLAY-ALONG] ✅ User ${userId} joined room ${actualRoomId} (black) - Code: ${roomData.roomCode}`);
      
      // Notify both players
      playAlongNamespace.to(actualRoomId).emit('game_start', {
        roomId: actualRoomId,
        roomCode: roomData.roomCode,
        ...roomData,
      });
    } catch (error) {
      console.error('[PLAY-ALONG] ❌ Error joining chess room:', error);
      socket.emit('error', { message: 'Failed to join game room' });
    }
  });

  // Make move
  socket.on('make_move', async ({ roomId, from, to, promotion }) => {
    const roomDataStr = await redisClient.get(REDIS_KEYS.CHESS_ROOM(roomId));
    if (!roomDataStr) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const roomData = JSON.parse(roomDataStr);
    
    if (roomData.status !== 'active') {
      socket.emit('error', { message: 'Game is not active' });
      return;
    }

    // Check if it's user's turn
    const expectedColor = roomData.turn;
    if (socket.data.color !== expectedColor) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // Validate move using chess.js
    const game = new Chess(roomData.fen);
    const move = { from, to };
    if (promotion) {
      move.promotion = promotion;
    }

    try {
      const result = game.move(move);
      if (!result) {
        socket.emit('error', { message: 'Invalid move' });
        return;
      }

      // Update game state
      roomData.fen = game.fen();
      roomData.turn = game.turn() === 'w' ? 'white' : 'black';

      // Check for game end
      if (game.isCheckmate()) {
        roomData.status = 'finished';
        roomData.winner = socket.data.color;
      } else if (game.isDraw() || game.isStalemate()) {
        roomData.status = 'finished';
        roomData.winner = 'draw';
      }

      await redisClient.setEx(REDIS_KEYS.CHESS_ROOM(roomId), 3600, JSON.stringify(roomData));

      console.log(`[PLAY-ALONG] ♟️ Move in room ${roomId}: ${from}→${to} by ${socket.data.color}`);
      
      // Broadcast move to all players
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
          reason: game.isCheckmate() ? 'checkmate' : 'draw',
        });
      }
    } catch (error) {
      console.error(`[PLAY-ALONG] ❌ Invalid move:`, error);
      socket.emit('error', { message: 'Invalid move: ' + error.message });
    }
  });

  // Resign
  socket.on('resign', async ({ roomId }) => {
    try {
      const roomDataStr = await redisClient.get(REDIS_KEYS.CHESS_ROOM(roomId));
      if (!roomDataStr) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const roomData = JSON.parse(roomDataStr);
      
      if (roomData.status === 'finished') {
        socket.emit('error', { message: 'Game is already finished' });
        return;
      }
      
      roomData.status = 'finished';
      roomData.winner = socket.data.color === 'white' ? 'black' : 'white';
      await redisClient.setEx(REDIS_KEYS.CHESS_ROOM(roomId), 3600, JSON.stringify(roomData));

      console.log(`[PLAY-ALONG] 🏳️ Resign in room ${roomId} by ${socket.data.color}`);
      
      playAlongNamespace.to(roomId).emit('game_over', {
        roomId,
        winner: roomData.winner,
        reason: 'resignation',
      });
    } catch (error) {
      console.error('[PLAY-ALONG] ❌ Error resigning:', error);
      socket.emit('error', { message: 'Failed to resign' });
    }
  });

  // Disconnect
  socket.on('disconnect', async (reason) => {
    const roomId = socket.data.roomId;
    if (roomId) {
      console.log(`[PLAY-ALONG] ❌ User ${userId} disconnected from room ${roomId}: ${reason}`);
      
      // Get room data to clean up code mapping
      const roomDataStr = await redisClient.get(REDIS_KEYS.CHESS_ROOM(roomId));
      if (roomDataStr) {
        const roomData = JSON.parse(roomDataStr);
        
        // Notify opponent
        socket.to(roomId).emit('opponent_left', { userId, roomId });
        
        // Clean up room and code mapping
        await redisClient.del(REDIS_KEYS.CHESS_ROOM(roomId));
        if (roomData.roomCode) {
          await redisClient.del(REDIS_KEYS.CHESS_CODE(roomData.roomCode));
        }
        console.log(`[PLAY-ALONG] 🧹 Room ${roomId} (Code: ${roomData.roomCode}) cleaned up`);
      }
    }
  });
});

// ====================================
// SING ALONG NAMESPACE (Phase 1: same as Watch Along)
// ====================================
// Reuse Watch Along logic for Phase 1
const singAlongNamespace = io.of('/sing-along');

singAlongNamespace.use((socket, next) => {
  if (!isAuthenticated(socket)) {
    console.log(`[SING-ALONG] ❌ Unauthenticated connection attempt from ${socket.id}`);
    return next(new Error('Authentication required'));
  }
  next();
});

// Forward all events to watch-along handlers (Phase 1)
singAlongNamespace.on('connection', (socket) => {
  const userId = getUserId(socket);
  console.log(`[SING-ALONG] ✅ User ${userId} connected (Phase 1: using Watch Along logic)`);
  
  // For Phase 1, reuse Watch Along room structure
  // Just use different Redis key prefix
  socket.on('create_sing_room', async ({ videoId, videoUrl }) => {
    const roomId = generateRoomId();
    const roomData = {
      roomId,
      hostId: userId,
      videoId,
      videoUrl,
      isPlaying: false,
      currentTime: 0,
      createdAt: new Date().toISOString(),
      participants: [userId],
    };

    await redisClient.setEx(REDIS_KEYS.SING_ROOM(roomId), 3600, JSON.stringify(roomData));
    
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.isHost = true;

    socket.emit('room_created', { roomId, ...roomData });
  });

  // Join sing room
  socket.on('join_sing_room', async ({ roomId }) => {
    if (!roomId) {
      socket.emit('error', { message: 'roomId is required' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.SING_ROOM(roomId));
    if (!roomDataStr) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const roomData = JSON.parse(roomDataStr);
    
    if (!roomData.participants.includes(userId)) {
      roomData.participants.push(userId);
      await redisClient.setEx(REDIS_KEYS.SING_ROOM(roomId), 3600, JSON.stringify(roomData));
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.isHost = roomData.hostId === userId;

    console.log(`[SING-ALONG] ✅ User ${userId} joined room ${roomId} (host: ${socket.data.isHost})`);
    
    socket.emit('room_joined', {
      roomId,
      ...roomData,
      isHost: socket.data.isHost,
    });

    socket.to(roomId).emit('participant_joined', { userId, roomId });
  });

  // Play (host only)
  socket.on('play', async ({ roomId, currentTime }) => {
    if (!socket.data.isHost) {
      socket.emit('error', { message: 'Only host can control playback' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.SING_ROOM(roomId));
    if (!roomDataStr) return;

    const roomData = JSON.parse(roomDataStr);
    roomData.isPlaying = true;
    roomData.currentTime = currentTime || 0;
    await redisClient.setEx(REDIS_KEYS.SING_ROOM(roomId), 3600, JSON.stringify(roomData));

    singAlongNamespace.to(roomId).emit('sync_play', { currentTime: roomData.currentTime });
  });

  // Pause (host only)
  socket.on('pause', async ({ roomId, currentTime }) => {
    if (!socket.data.isHost) {
      socket.emit('error', { message: 'Only host can control playback' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.SING_ROOM(roomId));
    if (!roomDataStr) return;

    const roomData = JSON.parse(roomDataStr);
    roomData.isPlaying = false;
    roomData.currentTime = currentTime || 0;
    await redisClient.setEx(REDIS_KEYS.SING_ROOM(roomId), 3600, JSON.stringify(roomData));

    singAlongNamespace.to(roomId).emit('sync_pause', { currentTime: roomData.currentTime });
  });

  // Seek (host only)
  socket.on('seek', async ({ roomId, currentTime }) => {
    if (!socket.data.isHost) {
      socket.emit('error', { message: 'Only host can control playback' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.SING_ROOM(roomId));
    if (!roomDataStr) return;

    const roomData = JSON.parse(roomDataStr);
    roomData.currentTime = currentTime;
    await redisClient.setEx(REDIS_KEYS.SING_ROOM(roomId), 3600, JSON.stringify(roomData));

    singAlongNamespace.to(roomId).emit('sync_seek', { currentTime });
  });

  // Change video (host only)
  socket.on('change_video', async ({ roomId, videoId, videoUrl }) => {
    if (!socket.data.isHost) {
      socket.emit('error', { message: 'Only host can change video' });
      return;
    }

    const roomDataStr = await redisClient.get(REDIS_KEYS.SING_ROOM(roomId));
    if (!roomDataStr) return;

    const roomData = JSON.parse(roomDataStr);
    roomData.videoId = videoId;
    roomData.videoUrl = videoUrl;
    roomData.currentTime = 0;
    roomData.isPlaying = false;
    await redisClient.setEx(REDIS_KEYS.SING_ROOM(roomId), 3600, JSON.stringify(roomData));

    singAlongNamespace.to(roomId).emit('sync_video', { videoId, videoUrl });
  });

  // Disconnect
  socket.on('disconnect', async (reason) => {
    const roomId = socket.data.roomId;
    if (roomId) {
      console.log(`[SING-ALONG] ❌ User ${userId} disconnected from room ${roomId}: ${reason}`);
      
      socket.to(roomId).emit('participant_left', { userId, roomId });
      
      if (socket.data.isHost) {
        await redisClient.del(REDIS_KEYS.SING_ROOM(roomId));
        console.log(`[SING-ALONG] 🧹 Room ${roomId} cleaned up (host left)`);
      }
    }
  });
});

// ====================================
// SERVER STARTUP
// ====================================
const PORT = process.env.ENGAGE_PORT || 3002;

// Connection monitoring for scalability
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 ENGAGE Socket.IO Server Running`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Port: ${PORT}`);
  console.log(`Host: 0.0.0.0 (all interfaces)`);
  console.log(`Max Connections: ${server.maxConnections}`);
  console.log(`Optimized for: 1000+ concurrent users`);
  console.log(`Namespaces:`);
  console.log(`  - /watch-along (YouTube sync)`);
  console.log(`  - /play-along (Real-time Chess)`);
  console.log(`  - /sing-along (Phase 1: YouTube sync)`);
  console.log(`Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
  console.log(`Redis Status: ${redisClient.isReady ? '✅ Connected' : '⚠️  Disconnected (will reconnect)'}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`${'='.repeat(50)}\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[SERVER] SIGTERM received, shutting down...');
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  } catch (error) {
    // Ignore errors if Redis is already closed
  }
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('\n[SERVER] SIGINT received, shutting down...');
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  } catch (error) {
    // Ignore errors if Redis is already closed
  }
  server.close(() => process.exit(0));
});

