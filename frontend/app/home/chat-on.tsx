import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import socketService from '../../services/socket';
import { ChatMessage } from '../../types';
import { useAuthStore } from '../../store/authStore';

export default function ChatOnScreen() {
  const { token } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isMatched, setIsMatched] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!token) return;

    const socket = socketService.getSocket();
    if (!socket) {
      socketService.connect(token);
    }

    // Listen for chat events
    socketService.on('chat_waiting', (data: any) => {
      setRoomId(data.room_id);
      setIsSearching(true);
    });

    socketService.on('chat_matched', (data: any) => {
      setRoomId(data.room_id);
      setIsSearching(false);
      setIsMatched(true);
    });

    socketService.on('chat_message', (data: ChatMessage) => {
      setMessages((prev) => [...prev, data]);
    });

    socketService.on('chat_partner_skipped', () => {
      alert('Your partner skipped. Finding new match...');
      handleStartChat();
    });

    return () => {
      socketService.off('chat_waiting');
      socketService.off('chat_matched');
      socketService.off('chat_message');
      socketService.off('chat_partner_skipped');
    };
  }, [token]);

  const handleStartChat = () => {
    setMessages([]);
    setIsMatched(false);
    setIsSearching(true);
    socketService.emit('join_anonymous_chat', {});
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !roomId) return;

    const newMessage: ChatMessage = {
      message_id: Date.now().toString(),
      message: inputMessage,
      timestamp: new Date().toISOString(),
      is_self: true,
    };

    setMessages((prev) => [...prev, newMessage]);
    socketService.emit('send_chat_message', {
      room_id: roomId,
      message: inputMessage,
    });
    setInputMessage('');
  };

  const handleSkip = () => {
    if (roomId) {
      socketService.emit('skip_chat', { room_id: roomId });
      handleStartChat();
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View
      style={[
        styles.messageBubble,
        item.is_self ? styles.myMessage : styles.theirMessage,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          item.is_self ? styles.myMessageText : styles.theirMessageText,
        ]}
      >
        {item.message}
      </Text>
    </View>
  );

  if (!isMatched && !isSearching) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.startContainer}>
          <Ionicons name="chatbubbles" size={80} color="#667eea" />
          <Text style={styles.startTitle}>Chat On</Text>
          <Text style={styles.startSubtitle}>
            Connect with random people anonymously
          </Text>
          <TouchableOpacity style={styles.startButton} onPress={handleStartChat}>
            <Text style={styles.startButtonText}>Start Chatting</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isSearching) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.searchingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.searchingText}>Finding someone to chat with...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.statusDot} />
        <Text style={styles.headerText}>Connected</Text>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Ionicons name="play-skip-forward" size={20} color="#fff" />
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={100}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.message_id}
          style={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputMessage.trim() && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputMessage.trim()}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  startContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  startTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 24,
    marginBottom: 8,
  },
  startSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  startButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#43e97b',
    marginRight: 8,
  },
  headerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f093fb',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  skipButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
    padding: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#667eea',
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
  },
  messageText: {
    fontSize: 15,
  },
  myMessageText: {
    color: '#fff',
  },
  theirMessageText: {
    color: '#333',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#667eea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
