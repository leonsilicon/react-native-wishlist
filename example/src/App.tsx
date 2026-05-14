import { Link, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Chat from './Chat/ChatExample';
// import { AssetListExample } from './AssetList/AssetListExample';

export function App() {
  return (
    <View style={styles.root}>
      <Chat />
      {/* `as Href` until expo-router regenerates `.expo/types/router.d.ts` for new routes. */}
      <Link href={'/levels' as Href} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open levels"
          style={({ pressed }) => [styles.fab, styles.fabLeft, pressed && styles.fabPressed]}
        >
          <Text style={styles.fabText}>Levels</Text>
        </Pressable>
      </Link>
      <Link href={'/asset-list' as Href} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open asset list"
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Text style={styles.fabText}>Assets</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    zIndex: 100,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#111',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabLeft: {
    right: 112,
  },
  fabPressed: {
    opacity: 0.85,
  },
  fabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
