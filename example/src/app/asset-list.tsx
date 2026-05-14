import React from 'react';
import { Stack } from 'expo-router';
import { AssetListExample } from '../AssetList/AssetListExample';

export default function AssetListScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Asset list' }} />
      <AssetListExample />
    </>
  );
}
