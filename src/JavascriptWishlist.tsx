import React, {
  forwardRef,
  Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import {
  JsCurrentValueContext,
  JsTemplatesContext,
} from './JsTemplatesContext';
import type { BaseItem, WishListInstance } from './Wishlist';
import { WishlistContext } from './WishlistContext';
import type { WishlistData, WishlistDataInternal } from './WishlistData';

type Props = {
  data: WishlistData<any>;
  wishlistId: string;
  templates: { [type: string]: React.ReactElement };
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle> | undefined;
  onStartReached?: () => void;
  onEndReached?: () => void;
  initialIndex?: number;
  ListHeaderComponent?:
    | React.ComponentType<any>
    | React.ReactElement
    | null
    | undefined;
  ListFooterComponent?:
    | React.ComponentType<any>
    | React.ReactElement
    | null
    | undefined;
};

let LegendListRef: any = null;
function getLegendList() {
  if (LegendListRef) return LegendListRef;
  // Lazy require so consumers that never use mode="javascript" don't pay
  // the resolution cost and don't need @legendapp/list installed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@legendapp/list');
  LegendListRef = mod.LegendList;
  return LegendListRef;
}

function getTemplateBody(
  templateEl: React.ReactElement,
): React.ReactNode {
  // Top-level templates collected from <Wishlist.Component> children are the
  // `<Wishlist.Template type="X">...</Wishlist.Template>` element itself.
  // Render the user's JSX directly (skip the wrapping Template gate) so
  // nested `<Wishlist.Template>`s inside aren't gated by an outer
  // renderChildren context — they self-register via JsTemplatesContext
  // and return null at their declaration site.
  if (
    React.isValidElement(templateEl) &&
    (templateEl.type as any)?.displayName === 'WishListTemplate'
  ) {
    return (templateEl.props as any).children as React.ReactNode;
  }
  return templateEl;
}

function ItemRenderer({
  item,
  templates,
}: {
  item: any;
  templates: { [type: string]: React.ReactElement };
}) {
  const templateEl = templates[item.type];
  if (!templateEl) return null;
  // rootValue == item at the top level; ForEach overrides this for sub-items.
  return (
    <JsCurrentValueContext.Provider value={{ item, rootValue: item }}>
      {getTemplateBody(templateEl)}
    </JsCurrentValueContext.Provider>
  );
}

function JavascriptWishlistInner(
  {
    data,
    wishlistId,
    templates,
    style,
    contentContainerStyle,
    onStartReached: _onStartReached,
    onEndReached,
    initialIndex,
    ListHeaderComponent,
    ListFooterComponent,
  }: Props,
  ref: Ref<WishListInstance>,
) {
  const LegendList = getLegendList();
  const internalData = data as WishlistDataInternal<BaseItem>;
  const [items, setItems] = useState<readonly any[]>(() =>
    internalData.__jsGetItems(),
  );

  useEffect(() => {
    const unsubscribe = internalData.__jsSubscribe(() => {
      setItems(internalData.__jsGetItems().slice());
    });
    return unsubscribe;
  }, [internalData]);

  const listRef = useRef<any>(null);

  useImperativeHandle(
    ref,
    (): WishListInstance => ({
      scrollToItem: (index: number, animated?: boolean) => {
        listRef.current?.scrollToIndex?.({
          index,
          animated: animated ?? true,
        });
      },
      scrollToTop: () => {
        listRef.current?.scrollToIndex?.({ index: 0, animated: true });
      },
    }),
  );

  const wishlistContextValue = useMemo(
    () => ({
      id: wishlistId,
      inflatorId: '__js__',
      data,
      mode: 'javascript' as const,
    }),
    [wishlistId, data],
  );

  // Combined map of declared templates (top-level + nested). Nested ones
  // self-register from inside `Wishlist.Template` during a hidden
  // prerender pass below. Using a ref + a small force-render counter
  // avoids the React "setState during render of another component" warning
  // that a setState-based registry would trigger when child Templates
  // register while their parent is still rendering.
  const nestedTemplatesRef = useRef<{ [type: string]: React.ReactElement }>(
    {},
  );
  const [registrationVersion, bumpRegistration] = useState(0);
  const registerNested = React.useCallback(
    (type: string, element: React.ReactElement) => {
      if (nestedTemplatesRef.current[type]) return;
      nestedTemplatesRef.current = {
        ...nestedTemplatesRef.current,
        [type]: element,
      };
      // Defer the re-render to after the current commit so we don't
      // setState during another component's render.
      Promise.resolve().then(() => bumpRegistration((v) => v + 1));
    },
    [],
  );

  const allTemplates = useMemo(
    () => ({ ...templates, ...nestedTemplatesRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, registrationVersion],
  );
  const jsTemplatesValue = useMemo(
    () => ({
      templates: allTemplates,
      registerNested,
    }),
    [allTemplates, registerNested],
  );

  const renderItem = useMemo(
    () =>
      ({ item }: { item: any }) =>
        <ItemRenderer item={item} templates={templates} />,
    [templates],
  );

  const keyExtractor = useMemo(
    () => (item: any, index: number) => item?.key ?? String(index),
    [],
  );

  return (
    <WishlistContext.Provider value={wishlistContextValue}>
      <JsTemplatesContext.Provider value={jsTemplatesValue}>
        <View style={[styles.flex, style]}>
          <LegendList
            ref={listRef}
            data={items}
            style={styles.flex}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={contentContainerStyle}
            onEndReached={onEndReached ? () => onEndReached() : undefined}
            initialScrollIndex={initialIndex}
            ListHeaderComponent={ListHeaderComponent ?? undefined}
            ListFooterComponent={ListFooterComponent ?? undefined}
            estimatedItemSize={60}
          />
        </View>
      </JsTemplatesContext.Provider>
    </WishlistContext.Provider>
  );
}

export const JavascriptWishlist = forwardRef(JavascriptWishlistInner);

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
