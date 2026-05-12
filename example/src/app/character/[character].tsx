import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function CharacterScreen() {
  const { character } = useLocalSearchParams<{ character: string }>();
  const label = character != null ? String(character) : '';

  return (
    <>
      <Stack.Screen options={{ title: label || 'Character' }} />
      <View style={styles.root}>
        <Text style={styles.label} selectable>
          {label}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  label: {
    fontSize: 48,
    textAlign: 'center',
  },
});
