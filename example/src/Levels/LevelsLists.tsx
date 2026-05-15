import { LegendList } from '@legendapp/list';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { LevelCard, buildLevelItems, type LevelItem } from './LevelCard';
import { LevelsWishlist } from './LevelsWishlistExample';
import type { Level } from './types';

export type LevelsBackend = 'flatlist' | 'flashlist' | 'legendlist' | 'wishlist';

function useGraphemePress() {
  const router = useRouter();

  return useCallback(
    (character: string) => {
      router.push({
        pathname: '/character/[character]',
        params: { character },
      } as unknown as Href);
    },
    [router],
  );
}

export function LevelsList({
  backend,
  levelList,
}: {
  backend: LevelsBackend;
  levelList: readonly Level[];
}) {
  if (backend === 'wishlist') {
    return <LevelsWishlist levelList={levelList} />;
  }

  return <LevelsPlainList backend={backend} levelList={levelList} />;
}

function LevelsPlainList({
  backend,
  levelList,
}: {
  backend: Exclude<LevelsBackend, 'wishlist'>;
  levelList: readonly Level[];
}) {
  const items = useMemo(() => buildLevelItems(levelList), [levelList]);
  const onGraphemePress = useGraphemePress();
  const handleGraphemePress = useCallback(
    (character: string, _item: LevelItem) => onGraphemePress(character),
    [onGraphemePress],
  );

  const renderItem = useCallback(
    ({ item }: { item: LevelItem }) => (
      <LevelCard item={item} onGraphemePress={handleGraphemePress} />
    ),
    [handleGraphemePress],
  );
  const keyExtractor = useCallback((item: LevelItem) => item.key, []);

  if (backend === 'flatlist') {
    return (
      <View style={styles.root}>
        <FlatList
          data={items as LevelItem[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          removeClippedSubviews
        />
      </View>
    );
  }

  if (backend === 'flashlist') {
    return (
      <View style={styles.root}>
        <FlashList
          data={items as LevelItem[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LegendList
        data={items as LevelItem[]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        recycleItems
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
