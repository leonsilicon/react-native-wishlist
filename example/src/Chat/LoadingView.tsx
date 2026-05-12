import { View, StyleSheet } from 'react-native';
import React from 'react';

export function LoadingView() {
  return (
    <View style={styles.container}>
      <View style={styles.loadingDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadingDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#9CA3AF',
  },
});
