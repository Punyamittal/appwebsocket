import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ActivitiesScreen() {
  const router = useRouter();

  const activities = [
    {
      id: 'watch',
      title: 'Watch Along',
      description: 'Watch YouTube videos together in sync',
      icon: 'play-circle',
      color: '#fa709a',
      route: '/features/watch',
      status: 'Available',
    },
    {
      id: 'chess',
      title: 'Play Chess',
      description: 'Play multiplayer chess with friends or random players',
      icon: 'game-controller',
      color: '#4facfe',
      route: '/features/chess',
      status: 'Available',
    },
    {
      id: 'sing',
      title: 'Sing Along',
      description: 'Karaoke together with real-time sync',
      icon: 'musical-notes',
      color: '#43e97b',
      route: '/features/sing',
      status: 'Beta',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Activities</Text>
          <Text style={styles.subtitle}>Choose what to do together</Text>
        </View>

        <View style={styles.activitiesContainer}>
          {activities.map((activity) => (
            <TouchableOpacity
              key={activity.id}
              style={styles.activityCard}
              onPress={() => router.push(activity.route as any)}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: activity.color },
                ]}
              >
                <Ionicons
                  name={activity.icon as any}
                  size={36}
                  color="#fff"
                />
              </View>
              <View style={styles.activityContent}>
                <View style={styles.activityTitleRow}>
                  <Text style={styles.activityTitle}>{activity.title}</Text>
                  {activity.status === 'Beta' && (
                    <View style={styles.betaBadge}>
                      <Text style={styles.betaText}>BETA</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.activityDescription}>
                  {activity.description}
                </Text>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          activity.status === 'Beta' ? '#43e97b' : '#667eea',
                      },
                    ]}
                  />
                  <Text style={styles.statusText}>{activity.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Coming Soon</Text>
          <Text style={styles.infoText}>
            More activities like board games, trivia, and group video calls are
            coming soon!
          </Text>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  activitiesContainer: {
    padding: 16,
  },
  activityCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  activityContent: {
    flex: 1,
    justifyContent: 'center',
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  activityTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  betaBadge: {
    backgroundColor: '#43e97b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  betaText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  activityDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  infoSection: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
