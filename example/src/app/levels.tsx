import React from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LevelsWishlistExample } from '../Levels/LevelsWishlistExample';

export default function LevelsScreen() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Levels wishlist' }} />
      <LevelsWishlistExample />
    </GestureHandlerRootView>
  );
}
