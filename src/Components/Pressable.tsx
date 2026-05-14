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

// Start above the range RNGH typically issues for handlers created via JS so
// our auto-generated tags don't collide with user-created gestures. Offset by
// a per-load random base so a Metro JS reload doesn't reuse the tags from the
// previous load (RNGH's native registry persists across JS reloads and would
// throw `HandlerAlreadyRegistered`).
let _handlerTag = 100000 + Math.floor(Math.random() * 1_000_000);

export function getNextHandlerTag(): number {
  return _handlerTag++;
}

const _attachedViewTags = new Set<number>();
const _handlerTagToViewTag = new Map<number, number>();

const RNGestureHandlerModule: RNGestureHandlerModuleProps =
  NativeModules.RNGestureHandlerModule;

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

const dropGestureHandlerNative = createRunInJsFn((tag: number) => {
  if (!_attachedViewTags.has(tag)) {
    return;
  }
  _attachedViewTags.delete(tag);
  for (const [hTag, vTag] of _handlerTagToViewTag.entries()) {
    if (vTag === tag) {
      try {
        RNGestureHandlerModule.dropGestureHandler(hTag);
      } catch (e) {}
      _handlerTagToViewTag.delete(hTag);
      break;
    }
  }
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

let _gestureListenerInstalled = false;
function installGestureListener() {
  if (_gestureListenerInstalled) {
    return;
  }
  _gestureListenerInstalled = true;
  DeviceEventEmitter.addListener(
    'onGestureHandlerStateChange',
    (event: { handlerTag: number; state: number; target?: number }) => {
      const viewTag = _handlerTagToViewTag.get(event.handlerTag);
      if (viewTag == null) {
        return;
      }
      // RNGH includes the view react tag on the event; ignore if our mapping
      // disagrees (stale handlerTag entries should not run another view's press).
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
  if (_attachedViewTags.has(tag)) {
    return;
  }
  _attachedViewTags.add(tag);
  installGestureListener();
  const handlerTag = getNextHandlerTag();
  _handlerTagToViewTag.set(handlerTag, tag);

  const attemptAttach = (retries: number) => {
    // If the handler was dropped while we were waiting, abort.
    if (!_attachedViewTags.has(tag)) {
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
        _handlerTagToViewTag.delete(handlerTag);
        _attachedViewTags.delete(tag);
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
