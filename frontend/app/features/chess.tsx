/**
 * Play Along - Chess Screen
 * 
 * Features:
 * - Create/Join chess games
 * - Real-time move sync
 * - Server-side move validation
 * - Turn-based gameplay
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import engageService from '../../services/engageService';

type GameState = 'idle' | 'waiting' | 'active' | 'finished';
type PlayerColor = 'white' | 'black' | null;

export default function ChessScreen() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [playerColor, setPlayerColor] = useState<PlayerColor>(null);
  const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');
  const [fen, setFen] = useState<string>('');
  const [winner, setWinner] = useState<string | null>(null);
  const socketRef = useRef<any>(null);

  // Auth check - redirect immediately if not authenticated
  if (!user || user.is_guest || !token) {
    return <Redirect href="/welcome" />;
  }

  // Cleanup
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        engageService.disconnectPlayAlong();
      }
    };
  }, []);

  // Setup Socket.IO listeners
  const setupSocketListeners = (socket: any) => {
    if (!socket || !user) return;

    // Remove existing listeners to avoid duplicates
    socket.off('room_created');
    socket.off('game_start');
    socket.off('move_update');
    socket.off('game_over');
    socket.off('opponent_left');
    socket.off('error');

    socket.on('room_created', (data: any) => {
      console.log('[Chess] Room created:', data);
      setRoomId(data.roomId);
      setRoomCode(data.roomCode || '');
      // Don't set playerColor yet - wait for opponent to join
      setPlayerColor(null);
      // Show game portal immediately with room code
      setGameState('active');
      setFen(data.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      setCurrentTurn('white');
    });

    socket.on('game_start', (data: any) => {
      console.log('[Chess] Game started:', data);
      setGameState('active');
      setFen(data.fen);
      setCurrentTurn(data.turn);
      if (data.whitePlayer === user.id) {
        setPlayerColor('white');
      } else if (data.blackPlayer === user.id) {
        setPlayerColor('black');
      }
    });

    socket.on('move_update', (data: any) => {
      console.log('[Chess] Move update:', data);
      setFen(data.fen);
      setCurrentTurn(data.turn);
      if (data.status === 'finished') {
        setGameState('finished');
        setWinner(data.winner);
      }
    });

    socket.on('game_over', (data: any) => {
      console.log('[Chess] Game over:', data);
      setGameState('finished');
      setWinner(data.winner);
      Alert.alert(
        'Game Over',
        data.winner === 'draw' ? 'Draw!' : `Winner: ${data.winner}`,
        [{ text: 'OK' }]
      );
    });

    socket.on('opponent_left', (data: any) => {
      Alert.alert('Opponent Left', 'Your opponent has disconnected.');
      setGameState('finished');
    });

    socket.on('error', (error: { message: string }) => {
      Alert.alert('Error', error.message);
    });
  };

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.off('room_created');
        socketRef.current.off('game_start');
        socketRef.current.off('move_update');
        socketRef.current.off('game_over');
        socketRef.current.off('opponent_left');
        socketRef.current.off('error');
      }
    };
  }, []);

  const handleCreateGame = async () => {
    if (!token || !user) {
      Alert.alert('Error', 'Authentication required');
      return;
    }

    try {
      const socket = engageService.connectPlayAlong(token, user.id);
      socketRef.current = socket;

      await new Promise((resolve, reject) => {
        if (socket.connected) {
          console.log('[Chess] Socket already connected');
          resolve(null);
          return;
        }

        const timeout = setTimeout(() => {
          console.error('[Chess] Connection timeout after 30 seconds');
          socket.disconnect();
          reject(new Error('Connection timeout. Make sure:\n\n1. Only ONE Engage server is running on port 3002\n2. Server is accessible at http://localhost:3002\n3. Check browser console for connection errors'));
        }, 30000); // 30 seconds timeout (matches client config)

        const connectHandler = () => {
          console.log('[Chess] Socket connected successfully');
          clearTimeout(timeout);
          socket.off('connect', connectHandler);
          socket.off('connect_error', errorHandler);
          socket.off('connected', connectedHandler);
          socket.off('server_ready', serverReadyHandler);
          resolve(null);
        };

        const connectedHandler = (data: any) => {
          console.log('[Chess] Server confirmed connection:', data);
          // Connection is confirmed, but wait for 'connect' event
        };

        const serverReadyHandler = (data: any) => {
          console.log('[Chess] Server ready:', data);
          // Fast acknowledgment - server is ready to accept commands
          // Still wait for 'connect' event for full connection
        };

        const errorHandler = (error: any) => {
          console.error('[Chess] Connection error:', error);
          clearTimeout(timeout);
          socket.off('connect', connectHandler);
          socket.off('connect_error', errorHandler);
          socket.off('connected', connectedHandler);
          reject(new Error(error.message || 'Failed to connect to game server. Make sure the Engage server is running on port 3002 and was restarted after code changes.'));
        };

        socket.once('connect', connectHandler);
        socket.once('connect_error', errorHandler);
        socket.once('connected', connectedHandler);
        socket.once('server_ready', serverReadyHandler);
      });

      // Set up listeners after connection is established
      setupSocketListeners(socket);

      socket.emit('create_chess_room');
    } catch (error: any) {
      console.error('[Chess] Create game error:', error);
      Alert.alert(
        'Connection Error', 
        error.message || 'Failed to create game. Make sure:\n\n1. Engage server is running (port 3002)\n2. Redis is running\n3. Check your network connection'
      );
    }
  };

  const handleJoinGame = async () => {
    if (!roomCode || roomCode.trim().length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit room code');
      return;
    }

    if (!token || !user) {
      Alert.alert('Error', 'Authentication required');
      return;
    }

    try {
      const socket = engageService.connectPlayAlong(token, user.id);
      socketRef.current = socket;

      await new Promise((resolve, reject) => {
        if (socket.connected) {
          resolve(null);
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve(null);
        });

        socket.once('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Set up listeners after connection is established
      setupSocketListeners(socket);

      // Send roomCode to server - server will look it up
      socket.emit('join_chess_room', { roomCode: roomCode.trim().toUpperCase() });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to join game');
    }
  };

  const handleMakeMove = (from: string, to: string, promotion?: string) => {
    if (!socketRef.current || !roomId || gameState !== 'active') return;
    if (currentTurn !== playerColor) {
      Alert.alert('Not Your Turn', 'Wait for your opponent to move.');
      return;
    }

    socketRef.current.emit('make_move', {
      roomId,
      from,
      to,
      promotion,
    });
  };

  const handleResign = () => {
    if (!socketRef.current || !roomId) return;
    
    Alert.alert(
      'Resign Game',
      'Are you sure you want to resign?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resign',
          style: 'destructive',
          onPress: () => {
            socketRef.current.emit('resign', { roomId });
          },
        },
      ]
    );
  };

  if (gameState === 'active' || gameState === 'finished' || gameState === 'waiting') {
    // Show game portal immediately when room is created
    // If we have a roomCode but no opponent has joined yet, we're waiting
    const isWaitingForOpponent = gameState === 'waiting' || (roomCode && !playerColor);
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Chess Game</Text>
            {roomCode && (
              <Text style={styles.roomCode}>Room: {roomCode.toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.gameContainer}>
          {/* Room Code Display - Prominent */}
          {roomCode && (
            <View style={styles.roomCodeDisplay}>
              <Text style={styles.roomCodeDisplayLabel}>Room Code</Text>
              <Text style={styles.roomCodeDisplayValue}>{roomCode.toUpperCase()}</Text>
              <Text style={styles.roomCodeDisplayHint}>Share this code to invite players</Text>
            </View>
          )}

          {/* Waiting Indicator */}
          {isWaitingForOpponent && (
            <View style={styles.waitingBanner}>
              <ActivityIndicator size="small" color="#7C3AED" />
              <Text style={styles.waitingBannerText}>Waiting for opponent to join...</Text>
            </View>
          )}

          {/* Chess Board Placeholder */}
          <View style={styles.boardPlaceholder}>
            <Text style={styles.chessIcon}>♔</Text>
            <Text style={styles.boardText}>Chess Board</Text>
            <Text style={styles.boardSubtext}>
              {gameState === 'finished'
                ? `Game Over - ${winner === 'draw' ? 'Draw' : `Winner: ${winner}`}`
                : isWaitingForOpponent
                ? 'Waiting for opponent...'
                : `Your Color: ${playerColor?.toUpperCase() || 'WHITE'}`}
            </Text>
            {!isWaitingForOpponent && (
              <>
                <Text style={styles.boardSubtext}>
                  Current Turn: {currentTurn?.toUpperCase() || 'WHITE'}
                </Text>
                {fen && (
                  <Text style={styles.boardSubtext}>
                    FEN: {fen.substring(0, 30)}...
                  </Text>
                )}
              </>
            )}
          </View>

          {/* Game Info */}
          <View style={styles.gameInfo}>
            <View style={styles.turnIndicator}>
              <View
                style={[
                  styles.turnDot,
                  currentTurn === 'white' && styles.turnDotActive,
                ]}
              />
              <Text style={styles.turnText}>
                {currentTurn === playerColor ? 'Your Turn' : "Opponent's Turn"}
              </Text>
            </View>

            {gameState === 'active' && (
              <TouchableOpacity style={styles.resignButton} onPress={handleResign}>
                <Text style={styles.resignButtonText}>Resign</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Move Input (Temporary - replace with actual board) */}
          {gameState === 'active' && currentTurn === playerColor && (
            <View style={styles.moveInput}>
              <Text style={styles.moveInputText}>
                TODO: Implement chess board UI
              </Text>
              <Text style={styles.moveInputSubtext}>
                Use react-native-chess or custom board component
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (gameState === 'waiting') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Waiting for Opponent</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.waitingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.waitingText}>Waiting for opponent to join...</Text>
          {roomCode && (
            <View style={styles.roomCodeBox}>
              <Text style={styles.roomCodeLabel}>Room Code:</Text>
              <Text style={styles.roomCodeValue}>{roomCode.toUpperCase()}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chess</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.chessIcon}>♔</Text>
        <Text style={styles.title}>Play Chess</Text>
        <Text style={styles.subtitle}>
          Challenge friends or random players to a chess match
        </Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreateGame}>
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.primaryButtonText}>Create New Game</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            style={styles.input}
            placeholder="Enter 6-digit room code"
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            value={roomCode || ''}
            onChangeText={(text) => {
              // Only allow numeric input
              const numericText = text.replace(/[^0-9]/g, '');
              setRoomCode(numericText);
            }}
            maxLength={6}
            keyboardType="numeric"
          />

          <TouchableOpacity style={styles.secondaryButton} onPress={handleJoinGame}>
            <Ionicons name="enter" size={24} color="#7C3AED" />
            <Text style={styles.secondaryButtonText}>Join Game</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Features:</Text>
          <Text style={styles.infoText}>• Real-time multiplayer</Text>
          <Text style={styles.infoText}>• Turn-based gameplay</Text>
          <Text style={styles.infoText}>• Server-side move validation</Text>
          <Text style={styles.infoText}>• Automatic game state sync</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  roomCode: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  chessIcon: {
    fontSize: 100,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 32,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 16,
    fontSize: 14,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: '#7C3AED',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    marginTop: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  waitingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    marginTop: 16,
  },
  roomCodeBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    alignItems: 'center',
  },
  roomCodeLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginBottom: 8,
  },
  roomCodeValue: {
    color: '#7C3AED',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 4,
  },
  gameContainer: {
    flex: 1,
    padding: 16,
  },
  boardPlaceholder: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  boardText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  boardSubtext: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginTop: 8,
  },
  gameInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  turnIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  turnDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  turnDotActive: {
    backgroundColor: '#7C3AED',
  },
  turnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  roomCodeDisplay: {
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#7C3AED',
  },
  roomCodeDisplayLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  roomCodeDisplayValue: {
    color: '#7C3AED',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 6,
    marginBottom: 8,
  },
  roomCodeDisplayHint: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    textAlign: 'center',
  },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  waitingBannerText: {
    color: '#7C3AED',
    fontSize: 14,
    fontWeight: '500',
  },
  resignButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    borderWidth: 1,
    borderColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resignButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  moveInput: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  moveInputText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  moveInputSubtext: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 8,
  },
});
