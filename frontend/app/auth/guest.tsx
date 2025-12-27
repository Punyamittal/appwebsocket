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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import uuid from 'react-native-uuid';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function GuestLoginScreen() {
  const router = useRouter();
  const { guestLogin } = useAuthStore();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [gender, setGender] = useState('other');
  const [loading, setLoading] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const { width, height } = useWindowDimensions();
  
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

  const handleGuestLogin = async () => {
    if (!name || !city) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const guestUuid = uuid.v4() as string;
      await guestLogin(guestUuid, name, city, gender);
      router.replace('/home/chat-on');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { width: '100%', height: '100%' }]}>
      {/* Dark Blue → Deep Navy Gradient Background - Same as Welcome Page */}
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#0F172A']} // Dark blue → navy → dark blue
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      >
        {/* Soft Radial Glow Effect - Same as Welcome Page */}
        <View style={styles.radialGlow} />

        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              alwaysBounceVertical={false}
            >
              <View style={[styles.content, { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
                {/* Header */}
                <View style={styles.header}>
                  <Pressable
                    style={styles.backButton}
                    onPress={() => {
                      if (router.canGoBack()) {
                        router.back();
                      } else {
                        router.push('/welcome');
                      }
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="arrow-back" size={24} color={Colors.text.inverse} />
                  </Pressable>
                </View>

                {/* Title Section - Same hierarchy as Welcome Page */}
                <View style={styles.titleSection}>
                  <Text style={[styles.title, { fontSize: titleSize }]}>Continue as Guest</Text>
                  <Text style={styles.subtitle}>Tell us a bit about yourself</Text>
                </View>

                {/* Form Section */}
                <View style={styles.formSection}>
                  {/* Name Input - Premium dark translucent style */}
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="person-outline"
                      size={20}
                      color="rgba(255, 255, 255, 0.5)"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Your Name"
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  {/* City Input - Premium dark translucent style */}
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="location-outline"
                      size={20}
                      color="rgba(255, 255, 255, 0.5)"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Your City"
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                      value={city}
                      onChangeText={setCity}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  {/* Gender Picker - Simple Dropdown */}
                  <View style={styles.pickerContainer}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.pickerButton,
                        pressed && styles.pickerButtonPressed,
                      ]}
                      onPress={() => setShowGenderPicker(!showGenderPicker)}
                    >
                      <Text 
                        style={[
                          styles.pickerButtonText,
                          !selectedGenderLabel || selectedGenderLabel === 'Select Gender' 
                            ? styles.pickerButtonPlaceholder 
                            : null
                        ]}
                      >
                        {selectedGenderLabel || 'Select Gender'}
                      </Text>
                      <Ionicons 
                        name={showGenderPicker ? "chevron-up" : "chevron-down"} 
                        size={18} 
                        color="rgba(255, 255, 255, 0.6)" 
                      />
                    </Pressable>

                    {/* Simple Dropdown - Positioned below button */}
                    {showGenderPicker && (
                      <>
                        <Pressable
                          style={styles.dropdownBackdrop}
                          onPress={closeDropdown}
                        />
                        <View style={styles.dropdownContainer}>
                          <View style={styles.dropdownModal}>
                            <LinearGradient
                              colors={['#1E293B', '#0F172A']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={styles.dropdownGradient}
                            >
                              <View style={styles.dropdownContent}>
                                {genderOptions.map((option, index) => (
                                  <Pressable
                                    key={option.value}
                                    style={({ pressed }) => [
                                      styles.dropdownItem,
                                      gender === option.value && styles.dropdownItemSelected,
                                      pressed && styles.dropdownItemPressed,
                                      index === genderOptions.length - 1 && styles.dropdownItemLast,
                                    ]}
                                    onPress={() => {
                                      handleGenderSelect(option.value);
                                    }}
                                    android_ripple={{ color: 'rgba(255, 255, 255, 0.1)' }}
                                  >
                                    <Text
                                      style={[
                                        styles.dropdownItemText,
                                        gender === option.value && styles.dropdownItemTextSelected,
                                      ]}
                                    >
                                      {option.label}
                                    </Text>
                                    {gender === option.value && (
                                      <View style={styles.checkmarkContainer}>
                                        <Ionicons 
                                          name="checkmark-circle" 
                                          size={20} 
                                          color="rgba(37, 99, 235, 0.9)" 
                                        />
                                      </View>
                                    )}
                                  </Pressable>
                                ))}
                              </View>
                            </LinearGradient>
                          </View>
                        </View>
                      </>
                    )}
                  </View>

                  {/* Continue Button - Gradient matching Welcome Page */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.button,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={handleGuestLogin}
                    disabled={loading}
                  >
                    <LinearGradient
                      colors={['#2563EB', '#06B6D4']} // Same gradient as Welcome Page
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      {loading ? (
                        <ActivityIndicator color={Colors.text.inverse} />
                      ) : (
                        <Text style={styles.buttonText}>Continue</Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  radialGlow: {
    position: 'absolute',
    top: -200,
    alignSelf: 'center',
    width: 600,
    height: 600,
    borderRadius: 300,
    backgroundColor: 'rgba(37, 99, 235, 0.15)', // Same soft blue glow as Welcome Page
    ...Platform.select({
      ios: {
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 100,
      },
      web: {
        boxShadow: '0 0 100px rgba(37, 99, 235, 0.3)',
      },
    }),
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 0, // Remove extra padding to eliminate white space
    minHeight: '100%', // Ensure scroll content fills viewport
  },
  content: {
    width: '100%',
    paddingHorizontal: Spacing.lg + 8, // Same padding as Welcome Page
    paddingTop: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.lg, // Platform-specific bottom padding
    minHeight: '100%', // Ensure content fills screen
  },
  header: {
    marginBottom: Spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Subtle transparent background
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  titleSection: {
    marginBottom: Spacing['2xl'],
  },
  title: {
    fontWeight: '700',
    letterSpacing: -0.5,
    color: Colors.text.inverse, // White text on dark background
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.inverse,
    opacity: 0.8, // Same soft opacity as Welcome Page
    lineHeight: 22,
  },
  formSection: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Dark translucent background - same as Welcome Page
    borderRadius: 16, // Rounded corners - premium feel
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)', // Subtle border
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md + 2,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.inverse, // White text
    padding: 0,
    margin: 0,
  },
  pickerContainer: {
    marginBottom: Spacing.lg,
    position: 'relative',
    zIndex: 1000,
  },
  dropdownContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    marginTop: Spacing.xs,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Premium dark translucent - matches input fields
    borderRadius: 16, // Consistent with other inputs
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)', // Subtle border
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md + 2,
    minHeight: 56, // Accessibility: minimum tap target
    ...Platform.select({
      web: {
        transition: 'all 0.2s ease',
      },
    }),
  },
  pickerButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pickerButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.inverse,
    opacity: 0.95,
  },
  pickerButtonPlaceholder: {
    opacity: 0.5, // Subtle placeholder style
  },
  dropdownModal: {
    width: '100%',
    borderRadius: 16, // Matches picker button radius
    overflow: 'hidden', // Clip gradient to rounded corners
    ...Platform.select({
      ios: {
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 8px 24px rgba(37, 99, 235, 0.2), 0 4px 8px rgba(0, 0, 0, 0.2)',
      },
    }),
  },
  dropdownGradient: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)', // More visible border
    overflow: 'hidden',
    backgroundColor: '#1E293B', // Solid fallback background
  },
  dropdownContent: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md + 4, // Generous vertical padding
    paddingHorizontal: Spacing.md + 4, // Comfortable horizontal padding
    borderRadius: 12,
    marginHorizontal: Spacing.xs,
    marginVertical: Spacing.xs / 2,
    minHeight: 52, // Accessibility: minimum tap target (44px + padding)
    ...Platform.select({
      web: {
        transition: 'all 0.15s ease',
        cursor: 'pointer',
      },
    }),
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)', // Soft blue highlight - not harsh
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)', // Subtle border for selected state
  },
  dropdownItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)', // Subtle pressed state
  },
  dropdownItemLast: {
    marginBottom: Spacing.xs,
  },
  dropdownItemText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium, // Medium weight for clarity
    color: Colors.text.inverse,
    opacity: 0.9, // High contrast for readability
    letterSpacing: 0.1,
  },
  dropdownItemTextSelected: {
    fontWeight: Typography.fontWeight.semibold, // Slightly bolder for selected
    color: Colors.text.inverse,
    opacity: 1, // Full opacity for selected
  },
  checkmarkContainer: {
    marginLeft: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
  button: {
    borderRadius: 28, // Pill shape - same as Welcome Page
    overflow: 'hidden',
    marginTop: Spacing.lg,
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
        boxShadow: '0 4px 8px rgba(37, 99, 235, 0.3)',
      },
    }),
  },
  buttonGradient: {
    paddingVertical: Spacing.md + 4,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    borderRadius: 28,
  },
  buttonPressed: {
    opacity: 0.95,
  },
  buttonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text.inverse,
    letterSpacing: 0.3,
  },
});
