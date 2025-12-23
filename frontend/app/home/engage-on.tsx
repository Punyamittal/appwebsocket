import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import socketService from '../../services/socket';
import { useAuthStore } from '../../store/authStore';

export default function EngageOnScreen() {
  const { token, user } = useAuthStore();
  const [isSearching, setIsSearching] = useState(false);
  const [isMatched, setIsMatched] = useState(false);
  const [isTimeRestricted, setIsTimeRestricted] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    // Check if current time is within 9 PM - 12 AM
    checkTimeRestriction();
    const interval = setInterval(checkTimeRestriction, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket = socketService.getSocket();
    if (!socket) {
      socketService.connect(token);
    }

    socketService.on('engage_waiting', (data: any) => {
      setRoomId(data.room_id);
      setIsSearching(true);
    });

    socketService.on('engage_matched', (data: any) => {
      setRoomId(data.room_id);
      setIsSearching(false);
      setIsMatched(true);
    });

    socketService.on('engage_time_restriction', (data: any) => {
      Alert.alert('Time Restriction', data.message);
      setIsSearching(false);
    });

    socketService.on('engage_partner_skipped', () => {
      Alert.alert('Partner Skipped', 'Your partner left. Finding new match...');
      handleStartEngage();
    });

    return () => {
      socketService.off('engage_waiting');
      socketService.off('engage_matched');
      socketService.off('engage_time_restriction');
      socketService.off('engage_partner_skipped');
    };
  }, [token]);

  const checkTimeRestriction = () => {
    const now = new Date();
    const hour = now.getHours();
    const restricted = hour >= 21 || hour < 0; // 9 PM (21:00) to 12 AM (00:00)
    setIsTimeRestricted(!restricted);
  };

  const handleStartEngage = () => {
    if (isTimeRestricted) {
      Alert.alert(
        'Time Restriction',
        'Engage On is only available between 9 PM - 12 AM in your timezone'
      );
      return;
    }

    if (!user) {
      Alert.alert('Authentication Required', 'Please login to use Engage On');
      return;
    }

    setIsMatched(false);
    setIsSearching(true);

    // Get timezone offset in hours
    const timezoneOffset = -new Date().getTimezoneOffset() / 60;

    socketService.emit('join_engage', {
      token,
      timezone_offset: timezoneOffset,
    });
  };

  const handleSkip = () => {
    if (roomId) {
      socketService.emit('skip_engage', { room_id: roomId });
      handleStartEngage();
    }
  };

  if (!isMatched && !isSearching) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.startContainer}>
          <Ionicons name="heart" size={80} color="#f093fb" />
          <Text style={styles.startTitle}>Engage On</Text>
          <Text style={styles.startSubtitle}>
            Match with opposite gender
          </Text>
          <Text style={styles.timeInfo}>
            Available: 9 PM - 12 AM (Your Timezone)
          </Text>
          <Text style={styles.requirementText}>
            Login Required
          </Text>

          {isTimeRestricted && (
            <View style={styles.restrictionBanner}>
              <Ionicons name="time" size={20} color="#fa709a" />
              <Text style={styles.restrictionText}>
                Not available at this time
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.startButton,
              isTimeRestricted && styles.startButtonDisabled,
            ]}
            onPress={handleStartEngage}
            disabled={isTimeRestricted}
          >
            <Text style={styles.startButtonText}>Start Matching</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isSearching) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.searchingContainer}>
          <ActivityIndicator size="large" color="#f093fb" />
          <Text style={styles.searchingText}>
            Finding your match...
          </Text>
          <Text style={styles.searchingSubtext}>
            Looking for opposite gender
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.statusDot} />
        <Text style={styles.headerText}>Matched!</Text>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Ionicons name="play-skip-forward" size={20} color="#fff" />
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.matchedContainer}>
        <Ionicons name="heart-circle" size={120} color="#f093fb" />
        <Text style={styles.matchedTitle}>You're Matched!</Text>
        <Text style={styles.matchedSubtitle}>
          Start a conversation
        </Text>
        <Text style={styles.comingSoonText}>
          Full chat interface coming soon!
        </Text>
      </View>
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
    marginBottom: 8,
  },
  timeInfo: {
    fontSize: 14,
    color: '#f093fb',
    fontWeight: '600',
    marginBottom: 8,
  },
  requirementText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 24,
  },
  restrictionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3f3',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  restrictionText: {
    color: '#fa709a',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: '#f093fb',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  startButtonDisabled: {
    opacity: 0.4,
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
  searchingSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
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
  matchedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  matchedTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 24,
    marginBottom: 8,
  },
  matchedSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  comingSoonText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});
