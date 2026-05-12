import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

type HeaderProps = {
  isLoading: boolean;
  onRefreshPress?: () => void;
};

const avatar = require('./assets/margelo_logo.png');

export function ChatHeader({ isLoading, onRefreshPress }: HeaderProps) {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={[styles.avatarContainer, isLoading && styles.gray]}>
          {!isLoading && (
            <Image style={styles.avatar} resizeMode="contain" source={avatar} />
          )}
        </View>
      </View>
      <View style={styles.center}>
        {!isLoading && <Text style={styles.title}>Margelo.com</Text>}
      </View>
      <View style={styles.right}>
        <Pressable
          accessibilityLabel="Open levels"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            console.log('pressed');
            onRefreshPress?.();
            router.push('/levels');
          }}
          style={styles.iconButton}
        >
          <Image
            pointerEvents="none"
            source={require('./assets/refresh.png')}
            style={styles.icon}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    elevation: 10,
    height: 108,
    paddingTop: 58,
    paddingHorizontal: 19,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  avatar: {
    width: 20,
    height: 20,
  },
  avatarContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gray: {
    backgroundColor: '#9DA0A8',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  left: {
    width: 60,
  },
  right: {
    width: 60,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 18,
    fontWeight: '500',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    padding: 8,
  },
  icon: {
    width: 24,
    height: 24,
  },
});
