import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { LEVELS_LIST } from '../Levels/LevelsWishlistExample';
import { LevelsList, type LevelsBackend } from '../Levels/LevelsLists';

const BACKENDS: { key: LevelsBackend; label: string }[] = [
  { key: 'flatlist', label: 'FlatList' },
  { key: 'flashlist', label: 'FlashList' },
  { key: 'legendlist', label: 'LegendList' },
  { key: 'wishlist', label: 'Wishlist' },
];

export default function LevelsScreen() {
  const [backend, setBackend] = useState<LevelsBackend>('wishlist');

  return (
    <>
      <Stack.Screen options={{ title: 'Levels' }} />
      <View style={styles.container}>
        <BackendToggle selected={backend} onSelect={setBackend} />
        <View style={styles.listContainer}>
          <LevelsList key={backend} backend={backend} levelList={LEVELS_LIST} />
        </View>
      </View>
    </>
  );
}

function BackendToggle({
  selected,
  onSelect,
}: {
  selected: LevelsBackend;
  onSelect: (backend: LevelsBackend) => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#1f2228',
            border: '#2f343c',
            inactiveText: '#aab1bd',
            activeBackground: '#3b82f6',
            activeText: '#ffffff',
          }
        : {
            background: '#f1f3f5',
            border: '#e1e4e8',
            inactiveText: '#3c4252',
            activeBackground: '#3b82f6',
            activeText: '#ffffff',
          },
    [isDark],
  );

  return (
    <View
      style={[
        styles.toggleContainer,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}
    >
      {BACKENDS.map(({ key, label }) => {
        const isActive = key === selected;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            style={[
              styles.toggleButton,
              isActive && { backgroundColor: palette.activeBackground },
            ]}
          >
            <Text
              style={[
                styles.toggleLabel,
                {
                  color: isActive ? palette.activeText : palette.inactiveText,
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  toggleButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  toggleContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    padding: 6,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
