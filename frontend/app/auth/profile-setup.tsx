import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

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

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [city, setCity] = useState(user?.city || '');
  const [gender, setGender] = useState(user?.gender || 'other');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(user?.avatar_base64 || 'i1');
  const [loading, setLoading] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const { width } = useWindowDimensions();
  
  // Responsive calculations
  const isSmallScreen = width < 375;
  const maxContentWidth = Math.min(width * 0.9, 450);
  const titleSize = isSmallScreen ? 28 : 32;

  const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
  ];

  const selectedGenderLabel = genderOptions.find(opt => opt.value === gender)?.label || 'Other';

  const openDropdown = () => {
    setShowGenderPicker(true);
  };

  const closeDropdown = () => {
    setShowGenderPicker(false);
  };

  const handleGenderSelect = (value: string) => {
    setGender(value);
    closeDropdown();
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your name');
      return;
    }

    if (!city.trim()) {
      Alert.alert('Required', 'Please enter your city');
      return;
    }

    setLoading(true);
    try {
      await updateProfile({ 
        name: name.trim(), 
        city: city.trim(), 
        gender: gender as any,
        avatar_base64: selectedAvatar 
      });
      router.replace('/home/chat-on');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { width: '100%', height: '100%' }]}>
      {/* Dark Blue → Deep Navy Gradient Background - Same as Welcome Page */}
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#0F172A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      >
        {/* Soft Radial Glow Effect */}
        <View style={styles.radialGlow} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.content, { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
              {/* Header Section */}
              <View style={styles.headerSection}>
                <Text style={[styles.title, { fontSize: titleSize }]}>Create Your Profile</Text>
                <Text style={styles.subtitle}>
                  We need a few details to personalize your experience
                </Text>
              </View>

              {/* Form Section */}
              <View style={styles.formSection}>
                {/* Name Input */}
                <View style={styles.inputContainer}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="person-outline" size={20} color="rgba(255, 255, 255, 0.6)" />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Your Name"
                    placeholderTextColor="rgba(255, 255, 255, 0.4)"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>

                {/* City Input */}
                <View style={styles.inputContainer}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="location-outline" size={20} color="rgba(255, 255, 255, 0.6)" />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Your City"
                    placeholderTextColor="rgba(255, 255, 255, 0.4)"
                    value={city}
                    onChangeText={setCity}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>

                {/* Avatar Selection */}
                <View style={styles.avatarSection}>
                  <Text style={styles.avatarSectionTitle}>Choose Your Avatar</Text>
                  <View style={styles.avatarGrid}>
                    {avatarOptions.map((avatarKey) => (
                      <Pressable
                        key={avatarKey}
                        style={[
                          styles.avatarOption,
                          selectedAvatar === avatarKey && styles.avatarOptionSelected,
                        ]}
                        onPress={() => setSelectedAvatar(avatarKey)}
                      >
                        <Image
                          source={avatarImages[avatarKey as keyof typeof avatarImages]}
                          style={styles.avatarImage}
                          resizeMode="cover"
                        />
                        {selectedAvatar === avatarKey && (
                          <View style={styles.avatarCheckmark}>
                            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Gender Picker */}
                <View style={styles.pickerContainer}>
                  <Pressable
                    style={styles.pickerButton}
                    onPress={openDropdown}
                  >
                    <View style={styles.pickerButtonContent}>
                      <View style={styles.inputIconContainer}>
                        <Ionicons name="male-female-outline" size={20} color="rgba(255, 255, 255, 0.6)" />
                      </View>
                      <Text style={[styles.pickerButtonText, !gender && styles.pickerButtonPlaceholder]}>
                        {selectedGenderLabel}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="rgba(255, 255, 255, 0.4)" />
                    </View>
                  </Pressable>

                  {showGenderPicker && (
                    <>
                      <Pressable
                        style={styles.dropdownBackdrop}
                        onPress={closeDropdown}
                      />
                      <View style={styles.dropdownContainer}>
                        {genderOptions.map((option) => (
                          <Pressable
                            key={option.value}
                            style={({ pressed }) => [
                              styles.dropdownOption,
                              gender === option.value && styles.dropdownOptionSelected,
                              pressed && styles.dropdownOptionPressed,
                            ]}
                            onPress={() => {
                              handleGenderSelect(option.value);
                            }}
                            android_ripple={{ color: 'rgba(255, 255, 255, 0.1)' }}
                          >
                            <Text
                              style={[
                                styles.dropdownOptionText,
                                gender === option.value && styles.dropdownOptionTextSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                            {gender === option.value && (
                              <Ionicons name="checkmark" size={20} color="#4A90E2" />
                            )}
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                </View>


                {/* Continue Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    loading && styles.primaryButtonDisabled,
                    pressed && styles.primaryButtonPressed,
                  ]}
                  onPress={handleSaveProfile}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#2563EB', '#06B6D4']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryButtonGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Continue</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundGradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  radialGlow: {
    position: 'absolute',
    top: -100,
    left: '50%',
    marginLeft: -200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    ...Platform.select({
      web: {
        boxShadow: '0 0 200px 100px rgba(37, 99, 235, 0.15)',
      },
    }),
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 0,
  },
  content: {
    paddingHorizontal: Spacing.lg + 8,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  headerSection: {
    marginBottom: Spacing['2xl'],
    alignItems: 'center',
  },
  title: {
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 22,
    textAlign: 'center',
  },
  formSection: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    minHeight: 56,
  },
  inputIconContainer: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    paddingVertical: Spacing.md,
  },
  pickerContainer: {
    marginBottom: Spacing.md,
    position: 'relative',
    zIndex: 1000,
  },
  pickerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 56,
    justifyContent: 'center',
  },
  pickerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: Spacing.sm,
  },
  pickerButtonPlaceholder: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
  dropdownContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      },
    }),
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md + 4,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 48,
  },
  dropdownOptionSelected: {
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
  },
  dropdownOptionPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownBackdrop: {
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
      },
      default: {
        position: 'absolute',
        top: -10000,
        left: -10000,
        right: -10000,
        bottom: -10000,
        zIndex: 999,
      },
    }),
  },
  dropdownOptionText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  dropdownOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  avatarSection: {
    marginBottom: Spacing.md,
  },
  avatarSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: Spacing.md,
    marginLeft: 4,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  avatarOption: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    position: 'relative',
    marginBottom: Spacing.sm,
  },
  avatarOptionSelected: {
    borderColor: '#4A90E2',
    borderWidth: 3,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarCheckmark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(74, 144, 226, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 56,
    ...Platform.select({
      ios: {
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
      },
    }),
  },
  primaryButtonGradient: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
