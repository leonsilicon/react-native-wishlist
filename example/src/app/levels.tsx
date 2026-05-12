import React from 'react';
import { Stack } from 'expo-router';
import { LevelsWishlistExample } from '../Levels/LevelsWishlistExample';

export default function LevelsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Levels wishlist' }} />
      <LevelsWishlistExample />
    </>
  );
}
