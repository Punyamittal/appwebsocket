import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const features = [
    {
      id: 'chat-on',
      title: 'Chat On',
      description: 'Anonymous random chat',
      icon: 'chatbubbles',
      color: '#667eea',
      route: '/home/chat-on',
    },
    {
      id: 'engage-on',
      title: 'Engage On',
      description: 'Match with opposite gender',
      icon: 'heart',
      color: '#f093fb',
      route: '/home/engage-on',
      timeRestricted: true,
    },
    {
      id: 'watch',
      title: 'Watch Along',
      description: 'Watch videos together',
      icon: 'play-circle',
      color: '#fa709a',
      route: '/features/watch',
    },
    {
      id: 'chess',
      title: 'Play Chess',
      description: 'Multiplayer chess game',
      icon: 'game-controller',
      color: '#4facfe',
      route: '/features/chess',
    },
    {
      id: 'sing',
      title: 'Sing Along',
      description: 'Karaoke together (BETA)',
      icon: 'musical-notes',
      color: '#43e97b',
      route: '/features/sing',
      beta: true,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {user?.name}!</Text>
          <Text style={styles.subtitle}>What would you like to do today?</Text>
        </View>

        <View style={styles.featuresContainer}>
          {features.map((feature) => (
            <TouchableOpacity
              key={feature.id}
              style={[styles.featureCard, { borderLeftColor: feature.color }]}
              onPress={() => router.push(feature.route as any)}
            >
              <View style={[styles.iconContainer, { backgroundColor: feature.color }]}>
                <Ionicons name={feature.icon as any} size={28} color="#fff" />
              </View>
              <View style={styles.featureContent}>
                <View style={styles.featureTitleRow}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  {feature.beta && (
                    <View style={styles.betaBadge}>
                      <Text style={styles.betaText}>BETA</Text>
                    </View>
                  )}
                  {feature.timeRestricted && (
                    <View style={styles.timeBadge}>
                      <Text style={styles.timeText}>9PM-12AM</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  featuresContainer: {
    padding: 16,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  betaBadge: {
    backgroundColor: '#43e97b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  betaText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  timeBadge: {
    backgroundColor: '#f093fb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
  },
});
