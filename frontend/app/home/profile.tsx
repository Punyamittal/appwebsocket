import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, useWindowDimensions, Image, Modal, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { Ionicons } from '@expo/vector-icons';
import TopNavigation from '../../components/TopNavigation';

// Import avatar images
const avatarImages = {
  i1: require('../../assets/images/i1.png'),
  i2: require('../../assets/images/i2.png'),
  i3: require('../../assets/images/i3.png'),
  i4: require('../../assets/images/i4.png'),
  i5: require('../../assets/images/i5.png'),
  i6: require('../../assets/images/i6.png'),
  i7: require('../../assets/images/i7.png'),
};

const avatarOptions = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, isAuthenticated, updateProfile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom + 24;
  const isGuest = !user || user.is_guest;
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const selectedAvatar = user?.avatar_base64 || 'i1';
  
  // If not authenticated, show redirect immediately (don't use useEffect for initial redirect)
  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔄 Profile: Starting logout process...');
              
              // Perform logout - this will set isAuthenticated to false
              await logout();
              console.log('✅ Profile: Logout completed');
              
              // Small delay to ensure state has updated
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Navigate directly to welcome screen
              router.replace('/welcome');
              
            } catch (error: any) {
              console.error('❌ Profile: Logout error:', error);
              // Even if there's an error, force navigation to welcome
              router.replace('/welcome');
            }
          },
        },
      ]
    );
  };

  const handleGoToAuth = () => {
    router.push('/welcome');
  };

  const handleAvatarSelect = async (avatarKey: string) => {
    try {
      await updateProfile({ avatar_base64: avatarKey });
      setShowAvatarPicker(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update avatar');
    }
  };

  const getAvatarImage = (avatarKey: string) => {
    if (avatarKey && avatarKey in avatarImages) {
      return avatarImages[avatarKey as keyof typeof avatarImages];
    }
    return avatarImages.i1;
  };

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
          <Pressable 
            style={styles.avatarContainer}
            onPress={() => !isGuest && setShowAvatarPicker(true)}
            disabled={isGuest}
          >
            <View style={styles.avatarCircle}>
              <Image
                source={getAvatarImage(selectedAvatar)}
                style={styles.avatarImage}
                resizeMode="cover"
              />
              {!isGuest && (
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="camera" size={16} color="#FFFFFF" />
                </View>
              )}
            </View>
          </Pressable>
          <Text style={styles.name}>{user?.name || 'Guest User'}</Text>
          <Text style={styles.email}>{user?.email || 'Guest User'}</Text>
        </View>

        {/* Profile Information Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          
          <View style={styles.infoRow}>
            <View style={styles.iconWrapper}>
              <Ionicons name="location" size={20} color="#4A90E2" />
            </View>
            <Text style={styles.infoLabel}>City:</Text>
            <Text style={styles.infoValue}>{user?.city || 'Not set'}</Text>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconWrapper}>
              <Ionicons name="male-female" size={20} color="#E91E63" />
            </View>
            <Text style={styles.infoLabel}>Gender:</Text>
            <Text style={styles.infoValue}>
              {user?.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'Not set'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconWrapper}>
              <Ionicons name="shield-checkmark" size={20} color="#10B981" />
            </View>
            <Text style={styles.infoLabel}>Status:</Text>
            <Text style={styles.infoValue}>
              {user?.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1) : 'Active'}
            </Text>
          </View>

          <View style={[styles.infoRow, styles.lastInfoRow]}>
            <View style={styles.iconWrapper}>
              <Ionicons name="calendar" size={20} color="#FFB020" />
            </View>
            <Text style={styles.infoLabel}>Member since:</Text>
            <Text style={styles.infoValue}>
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Today'}
            </Text>
          </View>
        </View>

        {/* Actions Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          
          {!isGuest && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/auth/profile-setup')}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(74, 144, 226, 0.15)' }]}>
                <Ionicons name="create" size={20} color="#4A90E2" />
              </View>
              <Text style={styles.actionText}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255, 255, 255, 0.3)" />
            </TouchableOpacity>
          )}

          {isGuest ? (
            <TouchableOpacity 
              style={[styles.actionButton, styles.lastActionButton]} 
              onPress={handleGoToAuth}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(74, 144, 226, 0.15)' }]}>
                <Ionicons name="log-in" size={20} color="#4A90E2" />
              </View>
              <Text style={[styles.actionText, { color: '#4A90E2' }]}>Go to Authentication</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255, 255, 255, 0.3)" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.actionButton, styles.lastActionButton]} 
              onPress={handleLogout}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(233, 30, 99, 0.15)' }]}>
                <Ionicons name="log-out" size={20} color="#E91E63" />
              </View>
              <Text style={[styles.actionText, { color: '#E91E63' }]}>Logout</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255, 255, 255, 0.3)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>GINGR v1.0.0</Text>
          <Text style={styles.footerSubtext}>Made with ❤️ for connecting people</Text>
        </View>
      </ScrollView>

      {/* Avatar Picker Modal */}
      <Modal
        visible={showAvatarPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAvatarPicker(false)}
      >
        <Pressable 
          style={styles.modalBackdrop}
          onPress={() => setShowAvatarPicker(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Your Avatar</Text>
              <Pressable onPress={() => setShowAvatarPicker(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
            <View style={styles.modalAvatarGrid}>
              {avatarOptions.map((avatarKey) => (
                <Pressable
                  key={avatarKey}
                  style={[
                    styles.modalAvatarOption,
                    selectedAvatar === avatarKey && styles.modalAvatarOptionSelected,
                  ]}
                  onPress={() => handleAvatarSelect(avatarKey)}
                >
                  <Image
                    source={avatarImages[avatarKey as keyof typeof avatarImages]}
                    style={styles.modalAvatarImage}
                    resizeMode="cover"
                  />
                  {selectedAvatar === avatarKey && (
                    <View style={styles.modalAvatarCheckmark}>
                      <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    backgroundColor: 'transparent',
    alignItems: 'center',
    padding: 32,
    paddingTop: 24,
  },
  avatarContainer: {
    marginBottom: 20,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(74, 144, 226, 0.3)',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4A90E2',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0F0F0F',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  email: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  section: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 20,
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
    }),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 20,
    letterSpacing: -0.2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  lastInfoRow: {
    borderBottomWidth: 0,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginRight: 12,
    minWidth: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'right',
    fontWeight: '500',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  lastActionButton: {
    borderBottomWidth: 0,
  },
  actionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    padding: 32,
    paddingTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 6,
  },
  footerSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  modalAvatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -8,
  },
  modalAvatarOption: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    position: 'relative',
    margin: 8,
  },
  modalAvatarOptionSelected: {
    borderColor: '#4A90E2',
    borderWidth: 3,
  },
  modalAvatarImage: {
    width: '100%',
    height: '100%',
  },
  modalAvatarCheckmark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(74, 144, 226, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
