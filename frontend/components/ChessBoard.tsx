/**
 * Chess Board Component
 * 
 * Renders a playable chess board from FEN notation
 * Handles piece selection and move making
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

// Chess piece Unicode symbols
const PIECES: { [key: string]: string } = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙', // White
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟', // Black
};

interface ChessBoardProps {
  fen: string;
  playerColor: 'white' | 'black' | null;
  currentTurn: 'white' | 'black';
  onMove: (from: string, to: string, promotion?: string) => void;
  disabled?: boolean;
}

export default function ChessBoard({ fen, playerColor, currentTurn, onMove, disabled = false }: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [board, setBoard] = useState<string[][]>([]);

  // Parse FEN to board representation
  useEffect(() => {
    if (!fen) return;
    
    try {
      const fenParts = fen.split(' ');
      const position = fenParts[0];
      const rows = position.split('/');
      
      const newBoard: string[][] = [];
      for (let row = 0; row < 8; row++) {
        const newRow: string[] = [];
        let col = 0;
        for (const char of rows[row]) {
          if (char >= '1' && char <= '8') {
            const emptySquares = parseInt(char);
            for (let i = 0; i < emptySquares; i++) {
              newRow.push('');
              col++;
            }
          } else {
            newRow.push(char);
            col++;
          }
        }
        newBoard.push(newRow);
      }
      
      setBoard(newBoard);
    } catch (error) {
      console.error('[ChessBoard] Error parsing FEN:', error);
    }
  }, [fen]);

  const getSquareColor = (row: number, col: number): string => {
    return (row + col) % 2 === 0 ? '#F0D9B5' : '#B58863'; // Light and dark squares
  };

  const getSquareName = (row: number, col: number): string => {
    const file = String.fromCharCode(97 + col); // a-h
    const rank = 8 - row; // 1-8
    return `${file}${rank}`;
  };

  const handleSquarePress = (row: number, col: number) => {
    console.log('[ChessBoard] Square pressed:', { row, col, disabled, currentTurn, playerColor });
    
    if (disabled) {
      console.log('[ChessBoard] Board is disabled');
      return;
    }
    
    if (currentTurn !== playerColor) {
      console.log('[ChessBoard] Not your turn', { currentTurn, playerColor });
      return;
    }

    const squareName = getSquareName(row, col);
    const piece = board[row]?.[col];
    const pieceChar = piece?.trim() || '';

    console.log('[ChessBoard] Square info:', { squareName, piece, pieceChar, selectedSquare });

    // If no piece selected, select this square if it has a piece of the current player's color
    if (!selectedSquare) {
      // Check if there's a valid piece (not empty, not space, and exists in PIECES)
      if (pieceChar && pieceChar !== ' ' && PIECES[pieceChar]) {
        // White pieces are uppercase (K, Q, R, B, N, P), black are lowercase (k, q, r, b, n, p)
        const isWhitePiece = pieceChar === pieceChar.toUpperCase() && pieceChar !== pieceChar.toLowerCase();
        const isPlayerWhite = playerColor === 'white';
        
        console.log('[ChessBoard] Piece check:', { 
          pieceChar, 
          isWhitePiece, 
          isPlayerWhite, 
          shouldSelect: (isWhitePiece && isPlayerWhite) || (!isWhitePiece && !isPlayerWhite)
        });
        
        if ((isWhitePiece && isPlayerWhite) || (!isWhitePiece && !isPlayerWhite)) {
          console.log('[ChessBoard] ✅ Selecting square:', squareName);
          setSelectedSquare(squareName);
        } else {
          console.log('[ChessBoard] ❌ Not your piece - this is a', isWhitePiece ? 'white' : 'black', 'piece');
        }
      } else {
        console.log('[ChessBoard] ❌ No piece on this square');
      }
      return;
    }

    // If same square selected, deselect
    if (selectedSquare === squareName) {
      console.log('[ChessBoard] Deselecting square');
      setSelectedSquare(null);
      return;
    }

    // Make move
    console.log('[ChessBoard] 🎯 Making move:', selectedSquare, '→', squareName);
    onMove(selectedSquare, squareName);
    setSelectedSquare(null);
  };

  // Rotate board if player is black
  const displayBoard = playerColor === 'black' 
    ? [...board].reverse().map(row => [...row].reverse())
    : board;

  const boardSize = Platform.OS === 'web' ? 400 : Math.min(350, 350);
  const squareSize = boardSize / 8;

  return (
    <View style={[styles.container, { width: boardSize, height: boardSize }]}>
      {/* File labels (a-h) */}
      {playerColor === 'white' && (
        <View style={styles.fileLabels}>
          {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file, idx) => (
            <Text key={file} style={[styles.label, { width: squareSize }]}>{file}</Text>
          ))}
        </View>
      )}

      <View style={styles.boardContainer}>
        {/* Rank labels (1-8) */}
        {playerColor === 'white' && (
          <View style={styles.rankLabels}>
            {[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => (
              <Text key={rank} style={[styles.label, { height: squareSize }]}>{rank}</Text>
            ))}
          </View>
        )}

        {/* Chess board */}
        <View style={styles.board}>
          {displayBoard.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.row}>
              {row.map((piece, colIdx) => {
                const actualRow = playerColor === 'black' ? 7 - rowIdx : rowIdx;
                const actualCol = playerColor === 'black' ? 7 - colIdx : colIdx;
                const squareName = getSquareName(actualRow, actualCol);
                const isSelected = selectedSquare === squareName;
                const isLight = (actualRow + actualCol) % 2 === 0;

                return (
                  <TouchableOpacity
                    key={`${rowIdx}-${colIdx}`}
                    style={[
                      styles.square,
                      {
                        width: squareSize,
                        height: squareSize,
                        backgroundColor: isSelected 
                          ? '#7C3AED' 
                          : isLight 
                            ? '#F0D9B5' 
                            : '#B58863',
                      },
                    ]}
                    onPress={() => handleSquarePress(actualRow, actualCol)}
                    disabled={disabled || currentTurn !== playerColor}
                  >
                    {piece && piece.trim() !== '' && piece.trim() !== ' ' && PIECES[piece] ? (
                      <Text style={styles.piece}>
                        {PIECES[piece]}
                      </Text>
                    ) : (
                      <View style={{ width: squareSize, height: squareSize }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Rank labels (1-8) - right side for black */}
        {playerColor === 'black' && (
          <View style={styles.rankLabels}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((rank) => (
              <Text key={rank} style={[styles.label, { height: squareSize }]}>{rank}</Text>
            ))}
          </View>
        )}
      </View>

      {/* File labels (a-h) - bottom for black */}
      {playerColor === 'black' && (
        <View style={styles.fileLabels}>
          {['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'].map((file) => (
            <Text key={file} style={[styles.label, { width: squareSize }]}>{file}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  board: {
    borderWidth: 2,
    borderColor: '#8B7355',
    borderRadius: 4,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  square: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  piece: {
    fontSize: 32,
    textAlign: 'center',
  },
  fileLabels: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
  rankLabels: {
    justifyContent: 'space-around',
    paddingRight: 4,
  },
  label: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    fontWeight: '500',
  },
});

