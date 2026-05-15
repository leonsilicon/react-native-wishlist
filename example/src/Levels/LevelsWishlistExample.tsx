import {
  Wishlist,
  useTemplateValue,
  createRunInJsFn,
  useWishlistData,
} from '@leonsilicon/react-native-wishlist';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import levelsList from './levels.json';
import type { Level } from './types';

export const LEVELS_LIST = levelsList as readonly Level[];

export type LevelItem = Level & {
  type: 'level';
  key: string;
  index: number;
};

type LevelGraphemeSubItem = {
  key: string;
  character: string;
};

/** Horizontal margin on each side of the level card (`styles.cardOuter`). */
const CARD_OUTER_MARGIN_H = 6;
/** Horizontal padding on each side of the grapheme grid (`styles.cardContent`). */
const CARD_CONTENT_PADDING_H = 8;
/** Border width on the level card (`styles.cardOuter`). */
const CARD_BORDER_WIDTH = 1;
/** Matches `SmallGraphemeButtonsList` default `gap` (horizontal between buttons in a row). */
const GRID_COLUMN_GAP = 6;
/** Matches `SmallGraphemeButtonsList` default `gap` (vertical between rows). */
const GRID_ROW_GAP = 8;
/** Grapheme columns per row (matches `SmallGraphemeButtonsList` on `LevelCardRenderer`). */
const GRAPHEME_COLUMNS = 8;

/**
 * Pixel width of one grapheme button so a row fits exactly {@link GRAPHEME_COLUMNS} buttons:
 * `GRAPHEME_COLUMNS * width + (GRAPHEME_COLUMNS - 1) * GRID_COLUMN_GAP === rowInnerWidth`
 * (same distribution as eight `flex: 1` slots with `gap: GRID_COLUMN_GAP`).
 */
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

/**
 * Theme tokens approximating uniwind/shadcn CSS variables (`--border`, `--card`, …)
 * for light and dark color schemes.
 */
function useLevelWishlistThemeColors() {
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

function LevelCellView({
  onGraphemePress,
}: {
  onGraphemePress: (subItem: LevelGraphemeSubItem, rootItem: LevelItem) => void;
}) {
  const colors = useLevelWishlistThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const [gridRowInnerWidthPx, setGridRowInnerWidthPx] = useState(0);
  const graphemeButtonWidthPx = useMemo(
    () => computeGraphemeButtonWidthPx(gridRowInnerWidthPx, windowWidth),
    [gridRowInnerWidthPx, windowWidth],
  );
  const levelText = useTemplateValue<LevelItem, string>((item) => {
    'worklet';

    return `Level ${item.index + 1}`;
  });
  const graphemeSubItemList = useTemplateValue<
    LevelItem,
    LevelGraphemeSubItem[]
  >((item) => {
    'worklet';

    return item.characters.map((character, index) => ({
      key: `${item.slug}:${index}`,
      character,
    }));
  });
  const levelSubtitle = useTemplateValue<LevelItem, string>((item) => {
    'worklet';

    return `${item.slug} · ${item.characters.length} cards`;
  });

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

  return (
    <View>
      <View style={cardOuterStyle}>
        <View style={headerStyle}>
          <View style={styles.headerTextColumn}>
            <Wishlist.Text style={levelTitleStyle}>{levelText}</Wishlist.Text>
            <Wishlist.Text style={characterCountStyle}>
              {levelSubtitle}
            </Wishlist.Text>
          </View>
        </View>
        <View style={contentStyle}>
          <View
            onLayout={(event) => {
              setGridRowInnerWidthPx(event.nativeEvent.layout.width);
            }}
            style={styles.gridRow}
          >
            <Wishlist.Template type="graphemeButton">
              <GraphemeButtonView
                graphemeButtonWidthPx={graphemeButtonWidthPx}
                onGraphemePress={onGraphemePress}
              />
            </Wishlist.Template>
            <Wishlist.ForEach
              style={styles.grid}
              items={graphemeSubItemList}
              template="graphemeButton"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function GraphemeButtonView({
  graphemeButtonWidthPx,
  onGraphemePress,
}: {
  graphemeButtonWidthPx: number;
  onGraphemePress: (subItem: LevelGraphemeSubItem, rootItem: LevelItem) => void;
}) {
  const colors = useLevelWishlistThemeColors();
  const character = useTemplateValue<LevelGraphemeSubItem, string>((subItem) => {
    'worklet';

    return subItem.character;
  });

  const pressableStyle = useMemo(
    () => [
      styles.graphemeButton,
      {
        backgroundColor: colors.graphemeBackground,
        borderColor: colors.graphemeBorder,
        height: graphemeButtonWidthPx,
        width: graphemeButtonWidthPx,
      },
    ],
    [colors.graphemeBackground, colors.graphemeBorder, graphemeButtonWidthPx],
  );
  const textStyle = useMemo(
    () => [styles.graphemeText, { color: colors.foreground }],
    [colors.foreground],
  );

  return (
    <Wishlist.Pressable onPress={onGraphemePress} style={pressableStyle}>
      <Wishlist.Text pointerEvents="none" style={textStyle}>
        {character}
      </Wishlist.Text>
    </Wishlist.Pressable>
  );
}

export function LevelsWishlist({
  levelList,
}: {
  levelList: readonly Level[];
}) {
  const router = useRouter();
  const navigateToGraphemeCard = useCallback(
    (subItem: LevelGraphemeSubItem, _rootItem: LevelItem) => {
      // `pathname` + `params` is the expo-router idiom; once `.expo/types/router.d.ts`
      // is regenerated for this route the `as unknown as Href` becomes redundant.
      router.push({
        pathname: '/character/[character]',
        params: { character: subItem.character },
      } as unknown as Href);
    },
    [router],
  );
  /** `createRunInJsFn` is created beside `Wishlist.Component` (see react-native-wishlist README). */
  const onGraphemePress = useMemo(
    () => createRunInJsFn(navigateToGraphemeCard),
    [navigateToGraphemeCard],
  );

  const data = useWishlistData<LevelItem>(() =>
    levelList.map((level, index) => ({
      ...level,
      characters: [...level.characters],
      type: 'level' as const,
      key: level.slug,
      index,
    })),
  );

  return (
    <View style={styles.root}>
      <Wishlist.Component style={styles.list} data={data} mode="javascript">
        <Wishlist.Template type="level">
          <LevelCellView onGraphemePress={onGraphemePress} />
        </Wishlist.Template>
      </Wishlist.Component>
    </View>
  );
}

export function LevelsWishlistExample() {
  return <LevelsWishlist levelList={LEVELS_LIST} />;
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
  list: {
    flex: 1,
  },
  root: {
    flex: 1,
  },
});
