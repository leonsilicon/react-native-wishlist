import React, { useCallback, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const GRID_COLS = 4;
const GRID_ROWS = 6;
const TOTAL = GRID_COLS * GRID_ROWS;
const H_PADDING = 24;
const GAP = 10;

const screenWidth = Dimensions.get('window').width;
const cellSize =
  (screenWidth - H_PADDING * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS;

export default function CharacterScreen() {
  const { character } = useLocalSearchParams<{ character: string }>();
  const label = character != null ? String(character) : '';

  const [whiteCells, setWhiteCells] = useState<Record<number, boolean>>({});

  const toggleCell = useCallback((index: number) => {
    setWhiteCells((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: label || 'Character' }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label} selectable>
          {label}
        </Text>
        <View style={styles.grid}>
          {Array.from({ length: TOTAL }, (_, index) => {
            const isWhite = whiteCells[index] === true;
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={`Cell ${index + 1}, ${isWhite ? 'white' : 'black'}`}
                onPress={() => toggleCell(index)}
                style={({ pressed }) => [
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  isWhite ? styles.cellWhite : styles.cellBlack,
                  pressed && styles.cellPressed,
                ]}
              >
                <Text style={isWhite ? styles.textBlack : styles.textWhite}>
                  {index + 1}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 24,
    alignItems: 'center',
  },
  label: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    columnGap: GAP,
    rowGap: GAP,
    maxWidth: screenWidth - H_PADDING * 2,
  },
  cell: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
  },
  cellBlack: {
    backgroundColor: '#000',
  },
  cellWhite: {
    backgroundColor: '#fff',
  },
  cellPressed: {
    opacity: 0.85,
  },
  textWhite: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  textBlack: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
});
