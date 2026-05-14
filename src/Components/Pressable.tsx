import React, { forwardRef, useCallback, useContext, useEffect } from 'react';
import {
  DeviceEventEmitter,
  NativeModules,
  Pressable as RNPressable,
  View,
  ViewProps,
} from 'react-native';
import { createTemplateComponent } from '../createTemplateComponent';
import { useTemplateCallback } from '../EventHandler';
import { getUIInflatorRegistry } from '../InflatorRepository';
import { useJsCurrentValue } from '../JsTemplatesContext';
import { WishlistContext } from '../WishlistContext';
import {
  createRunInWishlistFn,
  createRunInJsFn,
} from '../WishlistJsRuntime';

// Mirrors `RNGestureHandlerActionType` in react-native-gesture-handler. On the
// new architecture every state-change action type routes through
// `sendDeviceEventWithName:@"onGestureHandlerStateChange"` (a global JS device
// event), so we listen via `DeviceEventEmitter` and dispatch into the wishlist
// worklet runtime ourselves rather than relying on Fabric event observers.
const ActionType = {
  REANIMATED_WORKLET: 1,
  NATIVE_ANIMATED_EVENT: 2,
  JS_FUNCTION_OLD_API: 3,
  JS_FUNCTION_NEW_API: 4,
} as const;

type ActionTypeT = (typeof ActionType)[keyof typeof ActionType];

type RNGestureHandlerModuleProps = {
  handleSetJSResponder: (tag: number, blockNativeResponder: boolean) => void;
  handleClearJSResponder: () => void;
  createGestureHandler: (
    handlerName: string,
    handlerTag: number,
    config: Readonly<Record<string, unknown>>,
  ) => void;
  attachGestureHandler: (
    handlerTag: number,
    newView: number,
    actionType: ActionTypeT,
  ) => void;
  updateGestureHandler: (
    handlerTag: number,
    newConfig: Readonly<Record<string, unknown>>,
  ) => void;
  dropGestureHandler: (handlerTag: number) => void;
  install: () => void;
  flushOperations: () => void;
};

const RNGestureHandlerModule: RNGestureHandlerModuleProps =
  NativeModules.RNGestureHandlerModule;

// All state shared with prior JS module loads lives on `globalThis` so a Metro
// Fast Refresh — which re-loads this module but leaves the iOS RNGH handler
// registry, the gesture recognizers attached to UIViews, and the previous
// wishlist worklet runtime's handler tables intact at first — can find and
// clean up everything the prior load owned. Module-local `Map`s would start
// empty on the new load and silently strand every prior generation's
// recognizers attached to views Fabric will recycle into unrelated screens.
type WishlistGestureRegistry = {
  // Auto-incrementing handlerTag. Persisted so we never reuse a tag the
  // previous module load handed out (RNGH would throw `HandlerAlreadyRegistered`).
  nextHandlerTag: number;
  // viewTag → metadata about the attached gesture handler.
  viewTagToEntry: Map<number, RegistryEntry>;
  // handlerTag → viewTag. Reverse index for the DeviceEventEmitter dispatch
  // — only events whose handlerTag we own are forwarded.
  handlerTagToViewTag: Map<number, number>;
  // wishlistId → Set<viewTag>. So when a `Wishlist.Component` instance
  // unmounts (React tree) we can drop every handler that belonged to it
  // synchronously, before Fabric has a chance to recycle the Pressable
  // UIViews into unrelated screens. Without this leg, the only path that
  // drops handlers for items currently in the viewport is the C++
  // `~MGViewportCarerImpl` destructor — which doesn't run when
  // react-navigation merely detaches the screen and keeps the wishlist in
  // memory, so its recognizers persist and fire on whatever views Fabric
  // recycles them into.
  wishlistIdToViewTags: Map<string, Set<number>>;
  // wishlistId → generation token. Bumped on each mount; used by the
  // worklet-runtime handler-callback wrapper to refuse to fire a callback
  // whose owning wishlist has unmounted (or been re-mounted with a fresh
  // identity) since the callback was registered. Globally-keyed so HMR
  // re-installs of this module preserve liveness state.
  aliveWishlists: Set<string>;
};

type RegistryEntry = {
  handlerTag: number;
  wishlistId: string;
};

const REGISTRY_KEY = '__wishlistGestureRegistry';

function getRegistry(): WishlistGestureRegistry {
  const g = globalThis as any;
  let reg: WishlistGestureRegistry | undefined = g[REGISTRY_KEY];
  if (!reg) {
    // Seed `nextHandlerTag` above the range RNGH typically issues for
    // handlers created via JS, with a random offset so a first-ever load
    // doesn't clash with whatever else may already exist on the runtime.
    reg = {
      nextHandlerTag: 100000 + Math.floor(Math.random() * 1_000_000),
      viewTagToEntry: new Map(),
      handlerTagToViewTag: new Map(),
      wishlistIdToViewTags: new Map(),
      aliveWishlists: new Set(),
    };
    g[REGISTRY_KEY] = reg;
  }
  return reg;
}

export function getNextHandlerTag(): number {
  const reg = getRegistry();
  return reg.nextHandlerTag++;
}

function dropHandlerForViewTagSync(viewTag: number) {
  const reg = getRegistry();
  const entry = reg.viewTagToEntry.get(viewTag);
  if (entry === undefined) {
    return;
  }
  reg.viewTagToEntry.delete(viewTag);
  reg.handlerTagToViewTag.delete(entry.handlerTag);
  const ownerSet = reg.wishlistIdToViewTags.get(entry.wishlistId);
  if (ownerSet !== undefined) {
    ownerSet.delete(viewTag);
    if (ownerSet.size === 0) {
      reg.wishlistIdToViewTags.delete(entry.wishlistId);
    }
  }
  try {
    RNGestureHandlerModule.dropGestureHandler(entry.handlerTag);
  } catch {
    // RNGH may have already dropped it (e.g. across a hot reload); ignore.
  }
}

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
} as const;

const dispatchGestureEventToWishlistRuntime = createRunInWishlistFn(
  (viewTag: number, event: any) => {
    'worklet';
    const handleEvent = global.handleEvent;
    if (typeof handleEvent === 'function') {
      handleEvent('onGestureHandlerStateChange', viewTag, event);
    }
  },
);

// Called from the wishlist worklet runtime when the C++ side returns an item
// to the pool (or tears the wishlist down). MUST be idempotent: the same
// viewTag may be dropped twice (e.g. once from `returnToPool`, again from the
// `~MGViewportCarerImpl` cleanup) and we never want to free an unrelated
// handler that happens to have inherited the tag in the meantime.
const dropGestureHandlerNative = createRunInJsFn((tag: number) => {
  dropHandlerForViewTagSync(tag);
});

let _installedWorkletGestureDrop = false;

/**
 * Native wishlist code (`ComponentsPool` / `MGViewportCarer`) calls
 * `global.dropGestureHandler` on the dedicated wishlist worklet runtime — the
 * one `WishlistJsRuntime` (C++) is bound to via `bindNativeWishlistContext`.
 * Using `runOnUI` here landed the function on Reanimated's shared UI runtime
 * instead, so C++ saw `global.dropGestureHandler` as undefined and silently
 * skipped every drop — leaving `global.handlers` entries alive after navigation
 * and producing "ghost" presses on the next screen.
 */
const installDropGestureHandlerOnWishlistRuntime = createRunInWishlistFn(() => {
  'worklet';
  global.dropGestureHandler = (tag: number) => {
    'worklet';
    if (typeof global.dropHandlers === 'function') {
      global.dropHandlers(tag);
    }
    dropGestureHandlerNative(tag);
  };
});

export function installWishlistWorkletGestureDrop() {
  if (_installedWorkletGestureDrop) {
    return;
  }
  _installedWorkletGestureDrop = true;

  installDropGestureHandlerOnWishlistRuntime();
}

/**
 * Called from the React-tree `Wishlist.Component` `useEffect` mount/unmount.
 * Tracks which wishlist instance IDs are currently considered live; the
 * worklet-side handler-callback wrapper consults `global.__wishlistAliveSet`
 * (mirrored into the wishlist runtime by `installAliveSetOnWishlistRuntime`)
 * and refuses to fire any callback whose owning wishlist isn't in the set.
 * This is the last-line defense against a recycled UIView's stale gesture
 * recognizer reaching a wishlist `onPress`.
 */
export function markWishlistAlive(wishlistId: string) {
  const reg = getRegistry();
  reg.aliveWishlists.add(wishlistId);
  setAliveOnWishlistRuntime(wishlistId, true);
}

/**
 * Drop every handler the wishlist instance owns and mark it dead. Runs
 * synchronously on the JS thread (`useEffect` cleanup) so that by the time
 * Fabric can recycle any of the wishlist's Pressable UIViews into a sibling
 * screen, every recognizer the wishlist attached has already been removed.
 */
export function markWishlistDead(wishlistId: string) {
  const reg = getRegistry();
  reg.aliveWishlists.delete(wishlistId);
  const owned = reg.wishlistIdToViewTags.get(wishlistId);
  if (owned !== undefined) {
    // Snapshot — `dropHandlerForViewTagSync` mutates the underlying set.
    const tags = Array.from(owned);
    for (const tag of tags) {
      dropHandlerForViewTagSync(tag);
    }
  }
  // The PressableView component cache for this wishlist becomes
  // unreachable too — no more renders will need it. (Per-wishlist factory
  // exists only so `addProps`'s worklet closure can capture the right id;
  // when the wishlist remounts a new id is generated anyway.)
  pressableViewByWishlist.delete(wishlistId);
  setAliveOnWishlistRuntime(wishlistId, false);
}

// `global.__wishlistAliveSet` on the wishlist runtime mirrors
// `reg.aliveWishlists` on the JS runtime. Worklet code consults it to
// refuse to fire callbacks for unmounted wishlists.
const setAliveOnWishlistRuntime = createRunInWishlistFn(
  (id: string, alive: boolean) => {
    'worklet';
    const g = global as any;
    let set: Set<string> | undefined = g.__wishlistAliveSet;
    if (!set) {
      set = new Set<string>();
      g.__wishlistAliveSet = set;
    }
    if (alive) {
      set.add(id);
    } else {
      set.delete(id);
    }
  },
);

// The DeviceEventEmitter listener is global to the JS runtime and outlives
// any individual Wishlist component. On Fast Refresh we want exactly one
// listener total: the previous module load (if any) installed a subscription
// against the OLD `getRegistry()` closure, so we must remove that one before
// installing a fresh listener that reads from the current registry. Without
// this, a reloaded JS module would have two listeners — one routing events
// through the previous closure's (now-empty) registry — and the orphan would
// dispatch the event with `viewTag === undefined` to no callback, which is
// merely wasteful, but if the previous registry still held entries it would
// also fire press worklets that were captured from the previous load.
const LISTENER_KEY = '__wishlistGestureListenerSubscription';

function installGestureListener() {
  const g = globalThis as any;
  const previous = g[LISTENER_KEY];
  if (previous && typeof previous.remove === 'function') {
    try {
      previous.remove();
    } catch {}
  }
  g[LISTENER_KEY] = DeviceEventEmitter.addListener(
    'onGestureHandlerStateChange',
    (event: { handlerTag: number; state: number; target?: number }) => {
      const reg = getRegistry();
      const entry = (() => {
        const viewTag = reg.handlerTagToViewTag.get(event.handlerTag);
        if (viewTag == null) {
          return undefined;
        }
        const e = reg.viewTagToEntry.get(viewTag);
        if (e === undefined || e.handlerTag !== event.handlerTag) {
          // Stale handlerTag mapping (registry has been replaced); refuse.
          return undefined;
        }
        return { viewTag, ...e };
      })();

      if (entry === undefined) {
        // Handler is not ours — could be a user-created RNGH gesture in the
        // same app, or a stale event for a handler we've already dropped.
        return;
      }
      // Defense in depth 1: RNGH includes the view react tag on the event.
      // Fabric assigns a fresh react tag every time it dequeues a recycled
      // UIView for a new component (`RCTComponentViewRegistry::dequeue…`
      // sets `view.tag = newTag`), and RNGH sources `event.target` from
      // `view.reactTag` which RNGH itself wrote during `attachGestureHandler`.
      // If the recognizer fires on a recycled view that we attached, the
      // associated-object `reactTag` still holds the OLD tag — so a check
      // against our recorded viewTag *will* match in that case, NOT
      // distinguish it. The same check still catches handlers we DID drop
      // but where the registry replacement (across HMR) reused a tag with
      // different identity, plus generic RNGH-internal sanity.
      const eventTarget = event.target;
      if (
        eventTarget !== undefined &&
        eventTarget !== null &&
        Number(eventTarget) !== entry.viewTag
      ) {
        return;
      }
      // Defense in depth 2: refuse if the owning `Wishlist.Component`
      // instance has unmounted. `markWishlistDead` drops every viewTag the
      // wishlist owned, so reaching this branch with a known viewTag whose
      // wishlist is dead would only happen if the listener was scheduled
      // before `markWishlistDead` ran but is being delivered after — in
      // which case the recognizer is also being removed; bail.
      if (!reg.aliveWishlists.has(entry.wishlistId)) {
        return;
      }
      dispatchGestureEventToWishlistRuntime(entry.viewTag, event);
    },
  );
}

// Install eagerly at module load. Previously the listener was installed
// lazily on the first attach, which left a window where a press event from a
// prior JS load could be received with no listener — but more importantly the
// eager install lets us proactively replace the previous load's listener
// before any new attach happens.
installGestureListener();

// HMR re-sync: Fast Refresh reloads this module, but the `useEffect` in
// `useWishlistGestureLifecycle` does NOT re-fire on still-mounted
// `Wishlist.Component`s (deps haven't changed) — so `markWishlistAlive`
// won't run again, and the previous load's `aliveWishlists` survives
// because the registry is on `globalThis`. The wishlist worklet runtime,
// however, is brand new on Fast Refresh (the previous one was destroyed)
// and its `global.__wishlistAliveSet` starts empty. Without resyncing,
// the Pressable's `onGestureEvent` aliveness check rejects every tap
// after a reload. Push every still-alive id into the new runtime.
function resyncAliveSetAcrossHMR() {
  const reg = getRegistry();
  for (const id of reg.aliveWishlists) {
    setAliveOnWishlistRuntime(id, true);
  }
}

resyncAliveSetAcrossHMR();

type PressableProps = ViewProps & {
  onPress?: ((item: any, rootItem: any) => void) | null;
};

function JsPressable({
  onPress,
  others,
  forwardedRef,
}: {
  onPress?: ((item: any, rootItem: any) => void) | null;
  others: ViewProps;
  forwardedRef: React.Ref<any>;
}) {
  const current = useJsCurrentValue();
  const handlePress = useCallback(() => {
    if (!onPress) return;
    onPress(current?.item, current?.rootValue);
  }, [onPress, current?.item, current?.rootValue]);
  return (
    <RNPressable {...(others as any)} ref={forwardedRef} onPress={handlePress} />
  );
}

// Batch attach work: instead of one scheduleOnRN per Pressable per push (which
// during a scroll-in of e.g. 12 grapheme buttons would queue 12 jobs to the RN
// thread + 12 `setTimeout`s and starve the scroll), collect all tags from the
// current push into a single batch and process them in one trip.
const attachGestureHandlersBatch = createRunInJsFn(
  (tags: number[], wishlistId: string) => {
    for (let i = 0; i < tags.length; i++) {
      attachOneGestureHandler(tags[i], wishlistId);
    }
  },
);

function attachOneGestureHandler(tag: number, wishlistId: string) {
  const reg = getRegistry();
  // If the owning wishlist has already unmounted between the worklet
  // collecting the tag and this batch processing, refuse — otherwise we
  // would attach a recognizer that nothing will ever drop. (The drop path
  // is keyed on wishlistId via `markWishlistDead`.)
  if (!reg.aliveWishlists.has(wishlistId)) {
    return;
  }
  const existing = reg.viewTagToEntry.get(tag);
  if (existing !== undefined) {
    if (existing.wishlistId !== wishlistId) {
      // Tag now belongs to a different wishlist (rare — Fabric tags are
      // monotonic). Drop the stale entry first.
      dropHandlerForViewTagSync(tag);
    } else {
      return;
    }
  }
  const handlerTag = getNextHandlerTag();
  reg.viewTagToEntry.set(tag, { handlerTag, wishlistId });
  reg.handlerTagToViewTag.set(handlerTag, tag);
  let ownerSet = reg.wishlistIdToViewTags.get(wishlistId);
  if (ownerSet === undefined) {
    ownerSet = new Set();
    reg.wishlistIdToViewTags.set(wishlistId, ownerSet);
  }
  ownerSet.add(tag);

  const attemptAttach = (retries: number) => {
    // If the handler was dropped while we were waiting, abort. We also bail
    // if the registry has reassigned this view to a different handlerTag
    // (would only happen on extreme reload churn, but cheap to guard).
    const current = reg.viewTagToEntry.get(tag);
    if (current === undefined || current.handlerTag !== handlerTag) {
      return;
    }
    // Also bail if the wishlist died while we were waiting.
    if (!reg.aliveWishlists.has(wishlistId)) {
      // Clean up the registry entries we created above — `markWishlistDead`
      // already ran without seeing them since we add asynchronously.
      dropHandlerForViewTagSync(tag);
      return;
    }

    try {
      RNGestureHandlerModule.createGestureHandler(
        'TapGestureHandler',
        handlerTag,
        {},
      );
    } catch (e) {
      // RNGH keeps its handler registry alive across Metro JS reloads. If a
      // handler with this tag already exists from a prior load, drop it and
      // retry — losing the stale handler is fine since its view is gone too.
      try {
        RNGestureHandlerModule.dropGestureHandler(handlerTag);
      } catch {}
      RNGestureHandlerModule.createGestureHandler(
        'TapGestureHandler',
        handlerTag,
        {},
      );
    }

    try {
      RNGestureHandlerModule.attachGestureHandler(
        handlerTag,
        tag,
        ActionType.JS_FUNCTION_OLD_API,
      );
      RNGestureHandlerModule.flushOperations();
    } catch (e) {
      // If the view is not mounted yet natively (e.g. Fabric async mounting),
      // attachGestureHandler might throw. Retry after a short delay.
      if (retries > 0) {
        setTimeout(() => attemptAttach(retries - 1), 16);
      } else {
        // Give up and clean up.
        dropHandlerForViewTagSync(tag);
      }
    }
  };

  // Delay the first attempt slightly to give Fabric time to mount the view,
  // especially during rapid scrolling.
  setTimeout(() => attemptAttach(10), 16);
}

// Per-push tag batch on the worklet runtime — collected by each Pressable's
// addProps, flushed once by `didPushChildren` via `addPushChildrenCallback`.
type PendingAttachBatch = { tags: number[]; wishlistId: string };

function getPendingAttachBatch(wishlistId: string): PendingAttachBatch {
  'worklet';
  // Keyed by wishlistId so two `Wishlist.Component` instances on the same
  // screen don't share a batch (and so an ownership-less batch can never
  // come into existence).
  let batches = (global as any).__wishlistPendingAttachBatches as
    | Map<string, PendingAttachBatch>
    | undefined;
  if (!batches) {
    batches = new Map();
    (global as any).__wishlistPendingAttachBatches = batches;
  }
  let batch = batches.get(wishlistId);
  if (!batch) {
    batch = { tags: [], wishlistId };
    batches.set(wishlistId, batch);
  }
  return batch;
}

function makePressableView(wishlistId: string) {
  return createTemplateComponent(View, {
    addProps: (item, props) => {
      'worklet';

      const tag = item.getTag();
      item.addProps(props);

      const batch = getPendingAttachBatch(wishlistId);
      if (batch.tags.length === 0) {
        // First Pressable of this push — schedule the flush callback once. All
        // subsequent Pressables in the same push will append to the batch and
        // share the single `scheduleOnRN` hop.
        getUIInflatorRegistry().addPushChildrenCallback(() => {
          'worklet';
          const b = getPendingAttachBatch(wishlistId);
          if (b.tags.length === 0) {
            return;
          }
          // Snapshot + clear before scheduling so a subsequent push starts fresh.
          const snapshot = b.tags.slice();
          b.tags.length = 0;
          attachGestureHandlersBatch(snapshot, wishlistId);
        });
      }
      batch.tags.push(tag);
    },
  });
}

// `createTemplateComponent` is cached per-wishlistId so an HMR reload (which
// reloads this module) still re-creates the component fresh, but two
// Pressables on the same wishlist within one render share the same factory.
const pressableViewByWishlist = new Map<string, ReturnType<typeof makePressableView>>();
function getPressableView(wishlistId: string) {
  let v = pressableViewByWishlist.get(wishlistId);
  if (!v) {
    v = makePressableView(wishlistId);
    pressableViewByWishlist.set(wishlistId, v);
  }
  return v;
}

export const Pressable = forwardRef<any, PressableProps>(
  ({ onPress, ...others }, ref) => {
    const wishlist = useContext(WishlistContext);
    if (!wishlist) {
      throw new Error(
        'Wishlist.Pressable must be rendered inside a Wishlist.Component template.',
      );
    }

    if (wishlist.mode === 'javascript') {
      // No gesture-handler, no worklet runtime — render a plain RN Pressable
      // and invoke onPress with the current item/root from React context.
      return (
        <JsPressable
          onPress={onPress}
          others={others}
          forwardedRef={ref}
        />
      );
    }

    const wishlistId = wishlist.id;

    // The handler callback is registered on the wishlist worklet runtime via
    // `setCallback` and lives in `global.handlers` until either the
    // `dropHandlers(tag)` path runs (scroll-out / pool teardown) or the
    // worklet runtime itself is destroyed. To make leakage impossible we
    // wrap the user's onPress with an aliveness check so that, no matter
    // what stale path delivers an event, we never invoke onPress for a
    // wishlist that has unmounted.
    const onGestureEvent = useTemplateCallback((ev, item, rootItem) => {
      'worklet';

      const g = global as any;
      const aliveSet: Set<string> | undefined = g.__wishlistAliveSet;
      if (aliveSet === undefined || !aliveSet.has(wishlistId)) {
        return;
      }

      if (ev.state === State.ACTIVE) {
        onPress?.(item, rootItem);
      }
    }, 'onGestureHandlerStateChange');

    const PressableView = getPressableView(wishlistId);
    return (
      <PressableView
        {...others}
        // @ts-expect-error
        onGestureEvent={onGestureEvent}
        ref={ref}
      />
    );
  },
);

/**
 * React-tree hook for `Wishlist.Component`. Marks the wishlist instance as
 * alive while mounted and synchronously drops every gesture handler it owns
 * on unmount — the last-line cleanup that closes the leak window between
 * React unmount and `~MGViewportCarerImpl` destruction (which may not run
 * for a long time when react-navigation keeps the screen in memory).
 */
export function useWishlistGestureLifecycle(wishlistId: string) {
  useEffect(() => {
    markWishlistAlive(wishlistId);
    return () => {
      markWishlistDead(wishlistId);
    };
  }, [wishlistId]);
}
