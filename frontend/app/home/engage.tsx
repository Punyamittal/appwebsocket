import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import TopNavigation from '../../components/TopNavigation';

export default function EngageScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom + 24;
  const isGuest = !user || user.is_guest;

  // Premium muted accent colors for sub-features
  const subFeatureColors = {
    watch: { icon: '#FFB020', badge: 'rgba(255, 176, 32, 0.15)' }, // Soft amber
    play: { icon: '#7C3AED', badge: 'rgba(124, 58, 237, 0.15)' }, // Soft purple
    sing: { icon: '#10B981', badge: 'rgba(16, 185, 129, 0.15)' }, // Soft green
  };

  // Sub-features under Engage
  const subFeatures = [
    {
      id: 'watch',
      title: 'Watch Along',
      description: 'Watch YouTube videos together in sync',
      icon: 'play-circle',
      colors: subFeatureColors.watch,
      route: '/features/watch',
    },
    {
      id: 'play',
      title: 'Play Along',
      description: 'Play games together with friends or random players',
      icon: 'game-controller',
      colors: subFeatureColors.play,
      route: '/features/chess',
    },
    {
      id: 'sing',
      title: 'Sing Along',
      description: 'Karaoke together with real-time sync',
      icon: 'musical-notes',
      colors: subFeatureColors.sing,
      route: '/features/sing',
      beta: true,
    },
  ];

  // If guest user, redirect to welcome/login immediately
  if (isGuest) {
    return <Redirect href="/welcome" />;
  }

  return (
    <View style={styles.container}>
      <TopNavigation />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Premium Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Engage</Text>
          <Text style={styles.subtitle}>
            Deeper interactions and shared activities
          </Text>
          <View style={styles.timeRestrictionBanner}>
            <Ionicons name="time-outline" size={14} color="#FFB020" />
            <Text style={styles.timeRestrictionText}>
              Available between 9 PM - 12 AM only
            </Text>
          </View>
        </View>

        {/* Info Section for Guests - Moved to Top */}
        {isGuest && (
          <View style={styles.infoSection}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="information-circle" size={24} color="#4A90E2" />
            </View>
            <Text style={styles.infoTitle}>Sign In Required</Text>
            <Text style={styles.infoText}>
              Create an account or sign in to access Engage features and connect with others through shared activities.
            </Text>
            <TouchableOpacity
              style={styles.signInButton}
              onPress={() => router.push('/welcome')}
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sub-features Cards */}
        <View style={styles.featuresContainer}>
          {subFeatures.map((feature) => {
            const isLocked = isGuest;
            return (
              <TouchableOpacity
                key={feature.id}
                style={[
                  styles.featureCard,
                  isLocked && styles.featureCardLocked,
                ]}
                onPress={() => {
                  if (isLocked) {
                    router.push('/welcome');
                  } else {
                    router.push(feature.route as any);
                  }
                }}
                activeOpacity={0.9}
              >
                <View style={[
                  styles.iconContainer,
                  { backgroundColor: feature.colors.badge },
                  isLocked && styles.iconContainerLocked,
                ]}>
                  <Ionicons
                    name={feature.icon as any}
                    size={32}
                    color={isLocked ? 'rgba(255, 255, 255, 0.3)' : feature.colors.icon}
                  />
                  {isLocked && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={16} color="rgba(255, 255, 255, 0.5)" />
                    </View>
                  )}
                </View>

                <View style={styles.featureContent}>
                  <View style={styles.featureTitleRow}>
                    <Text style={[
                      styles.featureTitle,
                      isLocked && styles.featureTitleLocked,
                    ]}>
                      {feature.title}
                    </Text>
                    {feature.beta && !isLocked && (
                      <View style={[styles.badge, { backgroundColor: feature.colors.badge }]}>
                        <Text style={[styles.badgeText, { color: feature.colors.icon }]}>BETA</Text>
                      </View>
                    )}
                    {feature.timeRestricted && !isLocked && (
                      <View style={[styles.timeBadge, { backgroundColor: feature.colors.badge }]}>
                        <Ionicons name="time-outline" size={10} color={feature.colors.icon} />
                        <Text style={[styles.timeText, { color: feature.colors.icon }]}>9PM-12AM</Text>
                      </View>
                    )}
                    {isLocked && (
                      <View style={styles.lockedBadge}>
                        <Text style={styles.lockedBadgeText}>Sign In</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[
                    styles.featureDescription,
                    isLocked && styles.featureDescriptionLocked,
                  ]}>
                    {feature.description}
                  </Text>
                </View>

                {isLocked ? (
                  <Ionicons
                    name="lock-closed"
                    size={18}
                    color="rgba(255, 255, 255, 0.3)"
                    style={styles.chevron}
                  />
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="rgba(255, 255, 255, 0.3)"
                    style={styles.chevron}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  infoSection: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#4A90E2',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 22,
    marginBottom: 12,
  },
  timeRestrictionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 176, 32, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 176, 32, 0.2)',
  },
  timeRestrictionText: {
    fontSize: 13,
    color: '#FFB020',
    fontWeight: '500',
    marginLeft: 6,
  },
  featuresContainer: {
    padding: 16,
    paddingTop: 8,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)',
      },
    }),
  },
  featureCardLocked: {
    opacity: 0.6,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    position: 'relative',
  },
  iconContainerLocked: {
    opacity: 0.5,
  },
  lockOverlay: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    padding: 4,
  },
  featureContent: {
    flex: 1,
    justifyContent: 'center',
  },
  featureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 12,
    letterSpacing: -0.2,
  },
  featureTitleLocked: {
    opacity: 0.6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  timeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  lockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(233, 30, 99, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(233, 30, 99, 0.3)',
  },
  lockedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#E91E63',
    letterSpacing: 0.2,
  },
  featureDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 20,
  },
  featureDescriptionLocked: {
    opacity: 0.4,
  },
  chevron: {
    marginLeft: 8,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  infoText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  signInButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#4A90E2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

