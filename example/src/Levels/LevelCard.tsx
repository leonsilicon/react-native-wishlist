import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import type { Level } from './types';

export type LevelItem = Level & {
  type: 'level';
  key: string;
  index: number;
};

const CARD_OUTER_MARGIN_H = 6;
const CARD_CONTENT_PADDING_H = 8;
const CARD_BORDER_WIDTH = 1;
const GRID_COLUMN_GAP = 6;
const GRID_ROW_GAP = 8;
const GRAPHEME_COLUMNS = 8;

function computeGraphemeButtonWidthPx(
  rowInnerWidthPx: number,
  windowWidthPx: number,
): number {
  const rowWidthPx =
    rowInnerWidthPx > 0
      ? rowInnerWidthPx
      : windowWidthPx -
        CARD_OUTER_MARGIN_H * 2 -
        CARD_BORDER_WIDTH * 2 -
        CARD_CONTENT_PADDING_H * 2;
  const gapTotalPx = GRID_COLUMN_GAP * (GRAPHEME_COLUMNS - 1);
  const usablePx = Math.max(0, rowWidthPx - gapTotalPx);
  const buttonWidthPx = usablePx / GRAPHEME_COLUMNS;

  return Math.max(1, buttonWidthPx);
}

const WHITESPACE_REGEX = /\s+/;

function hslaFromChannels(
  channels: string | number | undefined,
  alpha = 1,
): string {
  if (channels === undefined || channels === '') {
    return `hsla(0, 0%, 0%, ${alpha})`;
  }

  const value = String(channels);
  if (value.startsWith('hsl(') || value.startsWith('hsla(')) {
    return value;
  }

  const [hue = '0', saturation = '0%', lightness = '0%'] = value
    .trim()
    .split(WHITESPACE_REGEX);

  return `hsla(${hue}, ${saturation}, ${lightness}, ${alpha})`;
}

export function useLevelCardThemeColors() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const channels = useMemo(
    () =>
      isDark
        ? {
            border: '220 13% 28%',
            card: '220 15% 14%',
            muted: '220 12% 18%',
            mutedForeground: '220 9% 60%',
            foreground: '0 0% 95%',
          }
        : {
            border: '0 0% 90%',
            card: '0 0% 100%',
            muted: '0 0% 96%',
            mutedForeground: '0 0% 45%',
            foreground: '0 0% 9%',
          },
    [isDark],
  );

  return useMemo(
    () => ({
      borderMuted: hslaFromChannels(channels.border, 0.6),
      cardBackground: hslaFromChannels(channels.card),
      headerBackground: hslaFromChannels(channels.muted, 0.5),
      headerBorderBottom: hslaFromChannels(channels.border, 0.6),
      mutedForeground: hslaFromChannels(channels.mutedForeground),
      foreground: hslaFromChannels(channels.foreground),
      graphemeBorder: hslaFromChannels(channels.border),
      graphemeBackground: hslaFromChannels(channels.muted),
    }),
    [channels],
  );
}

export function buildLevelItems(
  levelList: readonly Level[],
): readonly LevelItem[] {
  return levelList.map((level, index) => ({
    ...level,
    characters: [...level.characters],
    type: 'level' as const,
    key: level.slug,
    index,
  }));
}

export function LevelCard({
  item,
  onGraphemePress,
}: {
  item: LevelItem;
  onGraphemePress: (character: string, item: LevelItem) => void;
}) {
  const colors = useLevelCardThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const [gridRowInnerWidthPx, setGridRowInnerWidthPx] = useState(0);
  const graphemeButtonWidthPx = useMemo(
    () => computeGraphemeButtonWidthPx(gridRowInnerWidthPx, windowWidth),
    [gridRowInnerWidthPx, windowWidth],
  );

  const cardOuterStyle = useMemo(
    () => [
      styles.cardOuter,
      { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted },
    ],
    [colors.borderMuted, colors.cardBackground],
  );
  const headerStyle = useMemo(
    () => [
      styles.cardHeader,
      {
        backgroundColor: colors.headerBackground,
        borderBottomColor: colors.headerBorderBottom,
      },
    ],
    [colors.headerBackground, colors.headerBorderBottom],
  );
  const contentStyle = useMemo(
    () => [styles.cardContent, { backgroundColor: colors.cardBackground }],
    [colors.cardBackground],
  );
  const levelTitleStyle = useMemo(
    () => [styles.levelTitle, { color: colors.foreground }],
    [colors.foreground],
  );
  const characterCountStyle = useMemo(
    () => [styles.characterCount, { color: colors.mutedForeground }],
    [colors.mutedForeground],
  );

  const handlePress = useCallback(
    (character: string) => onGraphemePress(character, item),
    [item, onGraphemePress],
  );

  return (
    <View style={cardOuterStyle}>
      <View style={headerStyle}>
        <View style={styles.headerTextColumn}>
          <Text style={levelTitleStyle}>{`Level ${item.index + 1}`}</Text>
          <Text style={characterCountStyle}>
            {`${item.slug} · ${item.characters.length} cards`}
          </Text>
        </View>
      </View>
      <View style={contentStyle}>
        <View
          onLayout={(event) => {
            setGridRowInnerWidthPx(event.nativeEvent.layout.width);
          }}
          style={styles.gridRow}
        >
          <View style={styles.grid}>
            {item.characters.map((character, characterIndex) => (
              <GraphemeButton
                key={`${item.slug}:${characterIndex}`}
                character={character}
                size={graphemeButtonWidthPx}
                colors={colors}
                onPress={handlePress}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function GraphemeButton({
  character,
  size,
  colors,
  onPress,
}: {
  character: string;
  size: number;
  colors: ReturnType<typeof useLevelCardThemeColors>;
  onPress: (character: string) => void;
}) {
  const pressableStyle = useMemo(
    () => [
      styles.graphemeButton,
      {
        backgroundColor: colors.graphemeBackground,
        borderColor: colors.graphemeBorder,
        height: size,
        width: size,
      },
    ],
    [colors.graphemeBackground, colors.graphemeBorder, size],
  );
  const textStyle = useMemo(
    () => [styles.graphemeText, { color: colors.foreground }],
    [colors.foreground],
  );
  const handlePress = useCallback(
    () => onPress(character),
    [character, onPress],
  );

  return (
    <Pressable onPress={handlePress} style={pressableStyle}>
      <Text style={textStyle}>{character}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    paddingHorizontal: CARD_CONTENT_PADDING_H,
    paddingVertical: 8,
  },
  cardHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cardOuter: {
    borderRadius: 12,
    borderWidth: CARD_BORDER_WIDTH,
    elevation: 1,
    gap: 0,
    marginBottom: 8,
    marginHorizontal: CARD_OUTER_MARGIN_H,
    overflow: 'hidden',
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  characterCount: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  graphemeButton: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    padding: 0,
  },
  graphemeText: {
    fontSize: 16,
  },
  grid: {
    columnGap: GRID_COLUMN_GAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: GRID_ROW_GAP,
  },
  gridRow: {
    alignSelf: 'stretch',
  },
  headerTextColumn: {
    flexDirection: 'column',
  },
  levelTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
});
