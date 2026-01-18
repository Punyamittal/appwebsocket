// Import polyfills first (for Expo web - handles FontFaceObserver errors)
import '../polyfills';

import React from 'react';
import { Stack } from 'expo-router';
import AuthProvider from '../contexts/AuthProvider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        {/* Remove explicit auth and features - they're folder routes, handled automatically */}
        <Stack.Screen name="home" />
      </Stack>
    </AuthProvider>
  );
}
