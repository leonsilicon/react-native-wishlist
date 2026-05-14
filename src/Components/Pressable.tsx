import React, { forwardRef } from 'react';
import { DeviceEventEmitter, NativeModules, View, ViewProps } from 'react-native';
import { createTemplateComponent } from '../createTemplateComponent';
import { useTemplateCallback } from '../EventHandler';
import { getUIInflatorRegistry } from '../InflatorRepository';
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

// Tag tracking lives on `globalThis` so a Metro Fast Refresh (which re-loads
// this JS module but leaves RNGH's native handler registry intact) can find
// the previous load's attached tags and drop them. Without this, every reload
// stranded another generation of native handlers attached to views that the
// JS side had already forgotten about — those would later fire "ghost" press
// events on unrelated screens.
type WishlistGestureRegistry = {
  // Auto-incrementing handlerTag. Persisted so we never reuse a tag the
  // previous module load handed out (RNGH would throw `HandlerAlreadyRegistered`).
  nextHandlerTag: number;
  // viewTag → handlerTag. O(1) drop by viewTag, single entry per view (we
  // refuse to double-attach).
  viewTagToHandlerTag: Map<number, number>;
  // handlerTag → viewTag. Reverse index for the DeviceEventEmitter dispatch
  // — only events whose handlerTag we own are forwarded.
  handlerTagToViewTag: Map<number, number>;
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
      viewTagToHandlerTag: new Map(),
      handlerTagToViewTag: new Map(),
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
  const handlerTag = reg.viewTagToHandlerTag.get(viewTag);
  if (handlerTag === undefined) {
    return;
  }
  reg.viewTagToHandlerTag.delete(viewTag);
  reg.handlerTagToViewTag.delete(handlerTag);
  try {
    RNGestureHandlerModule.dropGestureHandler(handlerTag);
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
      const viewTag = reg.handlerTagToViewTag.get(event.handlerTag);
      if (viewTag == null) {
        // Handler is not ours — could be a user-created RNGH gesture in the
        // same app, or a stale event for a handler we've already dropped.
        return;
      }
      // Defense in depth: RNGH includes the view react tag on the event.
      // If our mapping disagrees, refuse to dispatch — a stale handlerTag
      // entry should never run another view's press worklet.
      const eventTarget = event.target;
      if (
        eventTarget !== undefined &&
        eventTarget !== null &&
        Number(eventTarget) !== viewTag
      ) {
        return;
      }
      dispatchGestureEventToWishlistRuntime(viewTag, event);
    },
  );
}

// Install eagerly at module load. Previously the listener was installed
// lazily on the first attach, which left a window where a press event from a
// prior JS load could be received with no listener — but more importantly the
// eager install lets us proactively replace the previous load's listener
// before any new attach happens.
installGestureListener();

type PressableProps = ViewProps & {
  onPress?: ((item: any, rootItem: any) => void) | null;
};

// Batch attach work: instead of one scheduleOnRN per Pressable per push (which
// during a scroll-in of e.g. 12 grapheme buttons would queue 12 jobs to the RN
// thread + 12 `setTimeout`s and starve the scroll), collect all tags from the
// current push into a single batch and process them in one trip.
const attachGestureHandlersBatch = createRunInJsFn((tags: number[]) => {
  for (let i = 0; i < tags.length; i++) {
    attachOneGestureHandler(tags[i]);
  }
});

function attachOneGestureHandler(tag: number) {
  const reg = getRegistry();
  if (reg.viewTagToHandlerTag.has(tag)) {
    return;
  }
  const handlerTag = getNextHandlerTag();
  reg.viewTagToHandlerTag.set(tag, handlerTag);
  reg.handlerTagToViewTag.set(handlerTag, tag);

  const attemptAttach = (retries: number) => {
    // If the handler was dropped while we were waiting, abort. We also bail
    // if the registry has reassigned this view to a different handlerTag
    // (would only happen on extreme reload churn, but cheap to guard).
    if (reg.viewTagToHandlerTag.get(tag) !== handlerTag) {
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
        try {
          RNGestureHandlerModule.dropGestureHandler(handlerTag);
        } catch {}
        reg.handlerTagToViewTag.delete(handlerTag);
        if (reg.viewTagToHandlerTag.get(tag) === handlerTag) {
          reg.viewTagToHandlerTag.delete(tag);
        }
      }
    }
  };

  // Delay the first attempt slightly to give Fabric time to mount the view,
  // especially during rapid scrolling.
  setTimeout(() => attemptAttach(10), 16);
}

// Per-push tag batch on the worklet runtime — collected by each Pressable's
// addProps, flushed once by `didPushChildren` via `addPushChildrenCallback`.
function getPendingAttachBatch(): number[] {
  'worklet';
  let batch = (global as any).__wishlistPendingAttachBatch as
    | number[]
    | undefined;
  if (!batch) {
    batch = [];
    (global as any).__wishlistPendingAttachBatch = batch;
  }
  return batch;
}

const PressableView = createTemplateComponent(View, {
  addProps: (item, props) => {
    'worklet';

    const tag = item.getTag();
    item.addProps(props);

    const batch = getPendingAttachBatch();
    if (batch.length === 0) {
      // First Pressable of this push — schedule the flush callback once. All
      // subsequent Pressables in the same push will append to the batch and
      // share the single `scheduleOnRN` hop.
      getUIInflatorRegistry().addPushChildrenCallback(() => {
        'worklet';
        const tags = getPendingAttachBatch();
        if (tags.length === 0) {
          return;
        }
        // Snapshot + clear before scheduling so a subsequent push starts fresh.
        const snapshot = tags.slice();
        tags.length = 0;
        attachGestureHandlersBatch(snapshot);
      });
    }
    batch.push(tag);
  },
});

export const Pressable = forwardRef<any, PressableProps>(
  ({ onPress, ...others }, ref) => {
    const onGestureEvent = useTemplateCallback((ev, item, rootItem) => {
      'worklet';

      if (ev.state === State.ACTIVE) {
        onPress?.(item, rootItem);
      }
    }, 'onGestureHandlerStateChange');

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
