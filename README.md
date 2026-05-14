# @leonsilicon/react-native-wishlist

> Experimental fork of <https://github.com/margelo/react-native-wishlist>, not intended for public use.

A high-performance, **template-based** list for React Native. Wishlist renders each "template" once and then reuses (recycles) the rendered native views as the user scrolls, updating their content from a dedicated worklet runtime — no React re-renders per item.

```jsx
<Wishlist.Component data={data}>
  <Wishlist.Template type="text-message">
    <TextMessageCell />
  </Wishlist.Template>
  <Wishlist.Template type="image-message">
    <ImageMessageCell />
  </Wishlist.Template>
</Wishlist.Component>
```

---

## Table of contents

1. [Why a template list](#why-a-template-list)
2. [Mental model & runtime architecture](#mental-model--runtime-architecture)
3. [Installation](#installation)
4. [Data shape](#data-shape)
5. [`Wishlist.Component`](#wishlistcomponent)
6. [`Wishlist.Template`](#wishlisttemplate)
7. [Template cells](#template-cells)
8. [`useTemplateValue`](#usetemplatevalue)
9. [`useTemplateDerivedValue`](#usetemplatederivedvalue)
10. [Drop-in components](#drop-in-components)
11. [Conditionals: `<Wishlist.IF>`](#conditionals-wishlistif)
12. [Switch/Case: `<Wishlist.Switch>` / `<Wishlist.Case>`](#switchcase-wishlistswitch--wishlistcase)
13. [Nested templates: `<Wishlist.ForEach>` and `<Wishlist.Template>` inside a cell](#nested-templates-wishlistforeach-and-wishlisttemplate-inside-a-cell)
14. [Pressable & event callbacks](#pressable--event-callbacks)
15. [Imperative data updates](#imperative-data-updates)
16. [Pagination / infinite scroll](#pagination--infinite-scroll)
17. [Header / footer](#header--footer)
18. [Scrolling imperatively](#scrolling-imperatively)
19. [`createRunInJsFn` and `createRunInWishlistFn`](#createruninjsfn-and-createruninwishlistfn)
20. [`createTemplateComponent` — wrapping your own native views](#createtemplatecomponent--wrapping-your-own-native-views)
21. [Interaction with `react-native-reanimated`](#interaction-with-react-native-reanimated)
22. [Pitfalls & rules of thumb](#pitfalls--rules-of-thumb)
23. [API reference](#api-reference)

---

## Why a template list

`FlatList` re-runs your cell render function for every row that comes into view. That gives you flexibility but costs JS work on every scroll tick.

Wishlist flips the model:

- For each `type` you declare, the cell is rendered **once** during mount and the resulting view tree is captured as a **template**.
- The native list keeps a small pool of templates and **recycles** them as items scroll in and out — it never asks React to render an individual row again.
- Each property that depends on item data is wired through a `useTemplateValue` mapper. When the list inflates a new item, those mappers run on a dedicated worklet runtime and write the new props directly to the native view via JSI.

The result: scroll work stays off the JS thread, and the perceived smoothness is on the order of native list views even with rich rows (avatars, reactions, conditional UI).

## Mental model & runtime architecture

There are **three** JavaScript runtimes you should be aware of:

| Runtime | Role |
|---|---|
| **JS thread** | React render, normal `useState`/`useEffect`/`useCallback`, `useSharedValue` *creation*. |
| **Reanimated UI runtime** | `useDerivedValue`, `useAnimatedStyle`, anything dispatched with `runOnUI`. *Not used by wishlist*. |
| **Wishlist worklet runtime** | Created by wishlist via `react-native-worklets` (`createWorkletRuntime({ name: 'wishlist' })`). Hosts every `useTemplateValue` mapper, the inflator that turns items into props, `useTemplateCallback`, the gesture dispatch path, and the data store accessed through `data.update(...)`. |

The wishlist runtime is deliberately **separate** from reanimated's UI runtime so wishlist's scroll inflation work never queues behind reanimated frames (and vice versa). Native C++ inside the library is bound to this runtime; globals like `global.__wishlistInflatorRegistry`, `global.handlers`, `global.handleEvent`, `global.dropGestureHandler`, and `global.wishlists` all live there. See `src/WishlistJsRuntime.ts`.

**Practical implication:** any function marked `'worklet';` inside a wishlist mapper, callback, or `data.update` job runs on the wishlist runtime — *not* reanimated's. Reanimated `SharedValue`s are not readable there. See [Interaction with react-native-reanimated](#interaction-with-react-native-reanimated).

## Installation

```sh
vp add @leonsilicon/react-native-wishlist
cd ios && pod install
```

Peer requirements:

- `react-native-worklets` (the new architecture worklets runtime — wishlist uses `createWorkletRuntime`, `runOnRuntime`, `scheduleOnRN`).
- `react-native-gesture-handler` (used by `<Wishlist.Pressable>` for tap detection; wishlist installs `TapGestureHandler` instances against recycled native views).
- React Native with Fabric enabled.

Add `useTemplateValue` (and `useTemplateDerivedValue`) to `react-native-worklets/plugin`'s `functionsToWorkletize` list in your `babel.config.js` so the babel plugin compiles their mapper arguments for the worklet runtime.

## Data shape

Every item must have a `type` (which template to use) and a `key` (a unique identifier):

```ts
type Item = {
  type: string;
  key: string;
};
```

A real example (from `example/src/Chat/Data.ts` and `example/src/AssetList`):

```ts
type ChatItem = {
  type: 'me' | 'other' | 'loading';
  key: string;
  author: string;
  avatarUrl: string;
  message: string;
  liked: boolean;
  showBiggerAvatar: boolean;
  reactions: ReactionItem[];
};
```

Items are mutable through the `data.update(...)` API — see [Imperative data updates](#imperative-data-updates).

## `Wishlist.Component`

The list root. Pass it a `data` from `useWishlistData(...)` and one `<Wishlist.Template type=...>` for each item type.

```tsx
import {
  Wishlist,
  useWishlistData,
  WishListInstance,
} from '@leonsilicon/react-native-wishlist';

function ChatRoom() {
  const data = useWishlistData<ChatItem>(() => []);
  const listRef = useRef<WishListInstance | null>(null);

  return (
    <Wishlist.Component
      style={styles.list}
      data={data}
      ref={listRef}
      initialIndex={0}
      onStartReached={...}
      onEndReached={...}
    >
      <Wishlist.Template type="me">
        <ChatItemView type="me" />
      </Wishlist.Template>
      <Wishlist.Template type="other">
        <ChatItemView type="other" />
      </Wishlist.Template>
      <Wishlist.Template type="loading">
        <LoadingView />
      </Wishlist.Template>
    </Wishlist.Component>
  );
}
```

Props (see `src/Wishlist.tsx`):

| Prop | Type | Notes |
|---|---|---|
| `data` | `WishlistData<T>` | **Required.** From `useWishlistData`. The legacy `initialData` prop is no longer supported and will throw. |
| `initialIndex` | `number` | Index of the row to position first on mount. Defaults to `-1` if a header is provided, else `0`. |
| `onStartReached` | `() => void` | Fired when the user scrolls past the first item. |
| `onEndReached` | `() => void` | Fired when the user scrolls past the last item. |
| `ListHeaderComponent` | `ReactElement | ComponentType` | Rendered above all rows (uses an internal `__wishlistHeader` template). |
| `ListFooterComponent` | `ReactElement | ComponentType` | Rendered below all rows. |
| `contentContainerStyle` | `StyleProp<ViewStyle>` | Style for the inner content container. |
| `style` | `StyleProp<ViewStyle>` | Style for the outer list view. |

Imperative methods exposed via `ref` (`WishListInstance`):

```ts
type WishListInstance = {
  scrollToItem: (index: number, animated?: boolean) => void;
  scrollToTop: () => void;
};
```

## `Wishlist.Template`

A registration marker. Its `type` must match the `type` field on the items that should render with it. The child cell is rendered **once** as the template body.

```tsx
<Wishlist.Template type="me">
  <ChatItemView type="me" />
</Wishlist.Template>
```

Templates can also be declared **inside** another template — useful for `<Wishlist.ForEach>` sub-items (see [Nested templates](#nested-templates-wishlistforeach-and-wishlisttemplate-inside-a-cell)).

## Template cells

A cell is just a regular React component. **But it only renders once.** That means anything you want to vary per item must come through `useTemplateValue` (or composed via `useTemplateDerivedValue`) — *not* via plain props on regular RN components.

A minimal cell:

```tsx
function TextMessageCell() {
  const username = useTemplateValue<TextChatMessage, string>((message) => {
    'worklet';
    return message.sender.username;
  });

  return (
    <View style={styles.cell}>
      <Wishlist.Text style={styles.username}>{username}</Wishlist.Text>
    </View>
  );
}
```

Notes:

- The arrow passed to `useTemplateValue` **must** start with `'worklet';` so the babel plugin compiles it for the wishlist runtime.
- The return value, `username`, is a `TemplateValue<string>` — a sentinel object the wishlist machinery recognises. Anywhere you pass it as a prop on a `Wishlist.*` component, wishlist will rewrite the prop on every inflation.
- Use `<Wishlist.Text>` (and the other drop-ins below) for any prop that depends on a `TemplateValue`. Regular RN components don't know how to be patched.

## `useTemplateValue`

```ts
function useTemplateValue<ItemT, ValueT>(
  mapper: (item: ItemT, rootValue: any) => ValueT,
): TemplateValue<ValueT>;
```

`mapper`:

- Runs on the **wishlist worklet runtime**, on each inflation.
- Receives the current item being inflated and the "root value" of the surrounding context (the parent item when used inside a `<Wishlist.ForEach>` template).
- Must be a worklet — start the body with `'worklet';`. Any nested function literals you pass to helpers like `Array#reduce` need their own `'worklet';` too:

  ```ts
  const reactions = useTemplateValue((item: ChatItem) => {
    'worklet';
    const obj = item.reactions.reduce((acc, i) => {
      'worklet';
      // ...
      return acc;
    }, {} as Record<string, ReactionItemCombined>);
    return Object.values(obj);
  });
  ```

The returned `TemplateValue<T>` exposes `.value()` (a `'worklet'` function returning the *current* value for whatever item is being inflated). You almost never call `.value()` from React code — you pass the `TemplateValue` as a child or prop to a `Wishlist.*` component and the library inflates it. You *do* call `.value()` when composing one template value from another inside a worklet (see [`useTemplateDerivedValue`](#usetemplatederivedvalue)).

### Where you can use a `TemplateValue`

- As the `children` of `<Wishlist.Text>`.
- As the `source` of `<Wishlist.Image>` (`{ uri: TemplateValue<string> }` is fine).
- As individual style fields on `<Wishlist.View>`, `<Wishlist.Text>`, `<Wishlist.Image>`, `<Wishlist.Pressable>` — for example `{ width: avatarSize, height: avatarSize }` where both are `TemplateValue<number>`.
- As the `condition` of `<Wishlist.IF>`.
- As the `value` of `<Wishlist.Switch>` / `<Wishlist.Case>`.
- As the `items` of `<Wishlist.ForEach>`.

Wishlist deep-walks the props of each `Wishlist.*` component and replaces any `TemplateValue` it finds in the tree.

## `useTemplateDerivedValue`

Sugar over `useTemplateValue` for composing other `TemplateValue`s (and reading any worklet-runtime state) without manually accepting `(item, root)` arguments.

```ts
function useTemplateDerivedValue<ValueT>(deriver: () => ValueT): TemplateValue<ValueT>;
```

The `deriver` runs on the wishlist runtime on every inflation. Inside it you may call `.value()` on any `TemplateValue` you have in scope and the value you read will be the current item's value — exactly what you want.

```tsx
function ReactionBadge() {
  const count = useTemplateValue((reaction: ReactionItemCombined) => {
    'worklet';
    return reaction.ids.length;
  });

  // Composed derivation — no need to take `(item, root)`.
  const showCounter = useTemplateDerivedValue(() => {
    'worklet';
    return count.value() > 1;
  });

  return (
    <Wishlist.IF condition={showCounter}>
      <Wishlist.Text>{count}</Wishlist.Text>
    </Wishlist.IF>
  );
}
```

Or combining multiple sources:

```tsx
const price = useTemplateValue((item: Item) => { 'worklet'; return item.price; });
const qty   = useTemplateValue((item: Item) => { 'worklet'; return item.qty; });

const total = useTemplateDerivedValue(() => {
  'worklet';
  return price.value() * qty.value();
});
```

Conceptually: `useDerivedValue`-shaped, but for wishlist's runtime, not reanimated's. There is no dependency array — every read inside `deriver` is automatically "live" because each `.value()` re-resolves from the registry on each call.

## Drop-in components

Wishlist provides templated replacements for the four RN components you most often need props-on-recycling for:

| Wishlist | RN | Use it for |
|---|---|---|
| `<Wishlist.View>` | `<View>` | Any view whose style depends on item data. |
| `<Wishlist.Text>` | `<Text>` | Item-derived text content and styling. |
| `<Wishlist.Image>` | `<Image>` | Per-item image sources, sizes, border radii. |
| `<Wishlist.Pressable>` | `<Pressable>` | Per-item taps that dispatch to the wishlist runtime. |

You can mix regular RN components freely **for anything that doesn't depend on the row's data** — those parts are simply baked into the template view tree.

`<Wishlist.Image>` has a small platform fix-up internally — on Android it wraps `source` into the array shape Fabric expects, and it exposes `style.borderRadius` and the four corner radii as inflatable props (see `src/Components/WishlistImage.tsx`).

## Conditionals: `<Wishlist.IF>`

Because cells render only once, you cannot write `{cond && <X />}` — the tree would be fixed at template time. Use `<Wishlist.IF>`:

```tsx
const isEditing = useTemplateValue((item: AssetListItemWithState) => {
  'worklet';
  return item.isEditing;
});

return (
  <Wishlist.View style={[styles.row, { paddingLeft }]}>
    <Wishlist.IF condition={isEditing}>
      <ItemCheckbox />
    </Wishlist.IF>
    <AssetInfo />
  </Wishlist.View>
);
```

Internally `<Wishlist.IF>` toggles `display: 'flex' | 'none'` on a wrapping view, so the children are mounted once and shown/hidden per item.

## Switch/Case: `<Wishlist.Switch>` / `<Wishlist.Case>`

Choose one of several subtrees based on a `TemplateValue`:

```tsx
const variant = useTemplateValue((item: Item) => {
  'worklet';
  return item.variant;
});

<Wishlist.Switch value={variant}>
  <Wishlist.Case value="a"><BranchA /></Wishlist.Case>
  <Wishlist.Case value="b"><BranchB /></Wishlist.Case>
  <Wishlist.Case value="c"><BranchC /></Wishlist.Case>
</Wishlist.Switch>;
```

Each branch is a regular view that's toggled with `display`. The `value` on `<Wishlist.Case>` may be a literal (string / boolean / number) or another `TemplateValue`.

## Nested templates: `<Wishlist.ForEach>` and `<Wishlist.Template>` inside a cell

Lists of variable length **inside** a row (e.g. reactions on a message) are expressed with a nested template plus `<Wishlist.ForEach>`. From `example/src/Chat/ChatItem.tsx`:

```tsx
const reactions = useTemplateValue((item: ChatItem) => {
  'worklet';
  const obj = item.reactions.reduce((acc, i) => {
    'worklet';
    if (acc[i.emoji]) {
      acc[i.emoji].ids.push(i.key);
    } else {
      acc[i.emoji] = { ...i, ids: [i.key] };
    }
    return acc;
  }, {} as Record<string, ReactionItemCombined>);
  return Object.values(obj);
});

return (
  // Register a *nested* template — its `Reaction` body is rendered once,
  // then reused for every reaction sub-item we feed in.
  <Wishlist.Template type="reaction">
    <Reaction />
  </Wishlist.Template>

  <Wishlist.ForEach
    style={styles.row}
    items={reactions}
    template="reaction"
  />
);
```

Inside the nested template body, `useTemplateValue` receives the **sub-item** as its first argument and the **parent item** (the row) as the second:

```tsx
function Reaction() {
  // First arg = the reaction sub-item.
  const emoji = useTemplateValue((sub: ReactionItemCombined) => {
    'worklet';
    return sub.emoji;
  });
  // ...
}
```

`<Wishlist.ForEach>` does not currently diff sub-children efficiently — it re-renders all sub-items when `items` changes (`Wishlist.tsx` has a TODO to make this incremental). Use it for short sub-lists, not full secondary scrolls.

## Pressable & event callbacks

Use `<Wishlist.Pressable>` for taps. Its `onPress` is a worklet that receives the current item and the parent item, and runs on the wishlist runtime:

```tsx
const data = useWishlistContextData<ChatItem>();

const toggleLike = (value: ChatItem) => {
  'worklet';
  data.update((dataCopy) => {
    const old = dataCopy.getItem(value.key);
    if (old) {
      old.liked = !old.liked;
      dataCopy.setItem(value.key, old);
    }
  });
};

return (
  <Wishlist.Pressable onPress={toggleLike}>
    <Wishlist.Text style={{ opacity: likeOpacity }}>{likeText}</Wishlist.Text>
  </Wishlist.Pressable>
);
```

To hop back to the JS thread (to call a regular React handler, `Alert.alert`, navigation, etc.) wrap the JS function with `createRunInJsFn`:

```tsx
const showItemAlert = createRunInJsFn((address: string) => {
  Alert.alert(address);
});

const onItemPress = (item: AssetListItemWithState) => {
  'worklet';
  if (item.isEditing) {
    toggleSelectedItem(item);
  } else {
    showItemAlert(item.address!);
  }
};

return <Wishlist.Pressable onPress={onItemPress}>{...}</Wishlist.Pressable>;
```

Implementation note (relevant if you're hunting bugs): wishlist installs RNGH `TapGestureHandler`s against the native view tag of each pressable row at inflation time. Several push events get batched into one `scheduleOnRN` hop so a scroll-in of e.g. a dozen tap targets doesn't flood the JS thread (`src/Components/Pressable.tsx`).

## Imperative data updates

`useWishlistData(getInitialData)` returns a `WishlistData<T>`:

```ts
const data = useWishlistData<ChatItem>(() => []);
```

To mutate the list, call `data.update(...)` with an **update job** — a worklet that receives a `DataCopy<T>` and mutates it in place. `update` returns a `Promise` that resolves with whatever the job returns. It can be called from JS *or* from inside another worklet (wishlist auto-detects the runtime).

```tsx
// JS thread:
const index = await data.update((dataCopy) => {
  'worklet';
  dataCopy.push(newItem);
  return dataCopy.length - 1;
});
listRef.current?.scrollToItem(index);

// From inside an onPress (already on wishlist runtime):
const toggleLike = (value: ChatItem) => {
  'worklet';
  data.update((dataCopy) => {
    'worklet';
    const old = dataCopy.getItem(value.key);
    if (old) {
      old.liked = !old.liked;
      dataCopy.setItem(value.key, old);
    }
  });
};
```

`DataCopy<T>` API (see `src/WishlistDataCopy.ts`):

| Method | Notes |
|---|---|
| `at(index)` | Read item at an index (supports negative indexes after `unshift`). |
| `getIndex(key)` | Look up an item's current index by key (O(n) — fine for typical sizes). |
| `length` | Current length. |
| `getItem(key)` | Read an item by key. |
| `setItem(key, value)` | Replace an item by key. |
| `setAt(index, value)` | Replace by index. |
| `push(value)` | Append. |
| `unshift(value)` | Prepend (uses a negative-indexed deque so existing indices stay stable). |
| `removeItem(key)` | Remove by key. |
| `setItems(items)` | Replace the whole list. |

Use `useWishlistContextData<T>()` inside a template cell to grab the current list's `WishlistData<T>` (handy when an onPress callback needs to update the list). It throws if called outside a `<Wishlist.Template>`'s subtree.

If you have a piece of React state that should drive the list (the `AssetListExample` pattern), update wishlist on render:

```tsx
const list = useMemo<ListItemsType[]>(() => /* derive from React state */, [...]);
const data = useWishlistData<ListItemsType>(() => list);

const prevListRef = useRef(list);
if (prevListRef.current !== list) {
  prevListRef.current = list;
  data.update((dataCopy) => {
    'worklet';
    dataCopy.setItems(list);
  });
}
```

## Pagination / infinite scroll

`onStartReached` and `onEndReached` fire when you reach either edge. Push a loading sentinel into the data, fetch, then swap it out. Pattern from `example/src/Chat/ChatExample.tsx`:

```tsx
const onEndReached = () => {
  if (loadingEndRef.current) return;
  loadingEndRef.current = true;

  data.update((dataCopy) => {
    'worklet';
    dataCopy.push(END_LOADING_ITEM);
  });

  setTimeout(async () => {
    const newItems = fetchData(INITIAL_ITEMS_COUNT);
    await data.update((dataCopy) => {
      'worklet';
      dataCopy.removeItem(END_LOADING_ITEM.key);
      for (const item of newItems) dataCopy.push(item);
    });
    loadingEndRef.current = false;
  }, LOADING_TIME);
};
```

(`END_LOADING_ITEM` is just `{ type: 'loading', key: 'end-loading' }` with a matching `<Wishlist.Template type="loading">`.)

## Header / footer

Pass any React element or component class:

```tsx
<Wishlist.Component
  data={data}
  ListHeaderComponent={<ChatHeader />}
  ListFooterComponent={Loader}
>
  {/* templates */}
</Wishlist.Component>
```

Internally these are registered as `__wishlistHeader` and `__wishlistFooter` templates and the inflator inserts them at the boundaries.

## Scrolling imperatively

```tsx
const listRef = useRef<WishListInstance | null>(null);
// ...
<Wishlist.Component ref={listRef} data={data}>...</Wishlist.Component>

// Later:
listRef.current?.scrollToItem(targetIndex);     // animated by default
listRef.current?.scrollToItem(targetIndex, false);
listRef.current?.scrollToTop();
```

## `createRunInJsFn` and `createRunInWishlistFn`

Two thin wrappers in `src/WishlistJsRuntime.ts` that move *function calls* between runtimes.

**`createRunInJsFn(fn)`** — call `fn` (a normal JS function) from a worklet:

```ts
const showAlert = createRunInJsFn((msg: string) => Alert.alert(msg));

const onPress = (item: Item) => {
  'worklet';
  showAlert(`Pressed ${item.key}`); // hops to JS thread via scheduleOnRN
};
```

It's the wishlist analogue of `runOnJS`. (Internally it wraps the dispatch in a `'worklet'` so the closure serialises into both runtimes correctly — calling `runOnJS` eagerly at module load would throw.)

**`createRunInWishlistFn(fn)`** — call a worklet from the JS thread by routing it through `runOnRuntime(getWishlistRuntime(), fn)`:

```ts
const installSomethingOnWishlist = createRunInWishlistFn(() => {
  'worklet';
  global.something = ...;
});

installSomethingOnWishlist();
```

These move calls; they do **not** share JSI object memory across runtimes.

## `createTemplateComponent` — wrapping your own native views

If you need to expose a native component (or a custom one composed with `createTemplateComponent`-flavoured `addProps`), use the factory:

```ts
export function createTemplateComponent<T>(
  Component: T,
  options?: {
    addProps?: (templateItem, props, inflatorId, pool, rootValue) => void;
    additionalTemplateProps?: string[];
  },
): TemplateComponent<T>;
```

`addProps` is a worklet that runs on every inflation; you can transform the props before they hit `templateItem.addProps(...)`. This is how `Wishlist.IF` toggles `display`, how `Wishlist.Switch`/`Case` pick a branch, how `Wishlist.Text` routes its content into the raw text node, and how `Wishlist.ForEach` materialises sub-items via `renderTemplate(...)`.

`additionalTemplateProps` lets you mark plain (non-`TemplateValue`) props inside nested paths as still being template-inflated (`Wishlist.Image` uses this for `style.borderRadius` and the four corner radii).

You generally only need this when adding a new native view that needs custom prop wiring.

## Interaction with `react-native-reanimated`

**Reanimated and wishlist run on different worklet runtimes.** What this means:

- Inside the body of a `useTemplateValue` / `useTemplateDerivedValue` / `useTemplateCallback`, **you cannot read a reanimated `SharedValue`**. The JSI object lives in reanimated's runtime; the wishlist runtime cannot see it.
- `useDerivedValue` (a reanimated hook) cannot be substituted for `useTemplateDerivedValue` inside a cell — they are not on the same runtime.

What works fine:

- Reanimated **outside** a wishlist row: animating headers, footers, sticky overlays, or any view that isn't a `Wishlist.*` drop-in — reanimated and wishlist don't share state, but they don't interfere either.
- **Driving wishlist data from a reanimated source** for low-frequency events: observe with `useAnimatedReaction`, hop to JS with `runOnJS`, push into wishlist via `data.update(...)`. Not suitable for per-frame animation.

If you need to compose template-derived values in a `useDerivedValue`-shaped way, use [`useTemplateDerivedValue`](#usetemplatederivedvalue).

## Pitfalls & rules of thumb

- **Cells render once.** Don't put `{cond && <X />}` or `data.map(...)` directly in a template — use `<Wishlist.IF>`, `<Wishlist.Switch>`, `<Wishlist.ForEach>` instead.
- **Worklets need `'worklet';`.** Every mapper, deriver, onPress, and `update` job body needs to start with `'worklet';`. So do nested function literals (e.g. the callback to `Array#reduce`).
- **Babel plugin opt-in.** Add `useTemplateValue` and `useTemplateDerivedValue` to your `react-native-worklets/plugin` `functionsToWorkletize` config so their arguments are auto-compiled.
- **Use the `Wishlist.*` drop-ins for data-driven props.** A plain `<Text>{templateValue}</Text>` will not be inflated — wishlist only walks props of components produced by `createTemplateComponent`.
- **`data.update` jobs are worklets too.** Don't capture closure state from JS — read with `dataCopy.getItem(key)` and write with `dataCopy.setItem(...)`.
- **Keys must be unique.** Wishlist throws if it inflates an item with no `key`, and recycling depends on identity.
- **Don't pass `initialData`.** That legacy prop now throws — use `useWishlistData(() => initial)`.
- **Reanimated `SharedValue`s aren't readable from template worklets.** See above.

## API reference

Everything exported from `@leonsilicon/react-native-wishlist`:

| Export | Kind | Summary |
|---|---|---|
| `Wishlist.Component` | Component | The list root. |
| `Wishlist.Template` | Component | Declares a template for a given `type`. |
| `Wishlist.View` / `.Text` / `.Image` / `.Pressable` | Components | Inflatable drop-ins for the corresponding RN primitives. |
| `Wishlist.IF` | Component | Conditional via `display`. |
| `Wishlist.Switch` / `.Case` | Components | Multi-branch conditional. |
| `Wishlist.ForEach` | Component | Render a `TemplateValue<Array>` against a nested template. |
| `WishListInstance` | Type | `scrollToItem`, `scrollToTop`. |
| `useTemplateValue` | Hook | Per-item derived value (mapper runs on wishlist runtime). |
| `useTemplateDerivedValue` | Hook | Sugar for composing other `TemplateValue`s without `(item, root)` args. |
| `TemplateValue<T>` | Type | `{ value(): T }`. |
| `createTemplateComponent` | Factory | Wrap a native component as a template-inflatable component. |
| `useWishlistData` | Hook | Create a mutable list data source. |
| `useWishlistContextData` | Hook | Read the current list's data source from inside a cell. |
| `WishlistData<T>` | Type | `{ update(job): Promise<R> }`. |
| `createRunInJsFn` | Helper | Bridge a JS function so it's callable from a worklet. |
| `createRunInWishlistFn` | Helper | Bridge a worklet so it's callable from JS. |
| `renderTemplate` | Worklet helper | Used by `Wishlist.ForEach`; only useful if you build a custom `createTemplateComponent` with `addProps` that needs to materialise sub-items. |

## License

MIT
