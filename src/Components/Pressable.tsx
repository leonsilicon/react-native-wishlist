import React, { forwardRef } from 'react';
import { DeviceEventEmitter, NativeModules, View, ViewProps } from 'react-native';
import { createTemplateComponent } from '../createTemplateComponent';
import { useTemplateCallback } from '../EventHandler';
import { getUIInflatorRegistry } from '../InflatorRepository';
import {
  createRunInWishlistFn,
  createRunInJsFn,
  wishlistContext,
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
 * Native wishlist code (`ComponentsPool` / `MGViewportCarer`) invokes
 * `global.dropGestureHandler` on the **wishlist worklet** JSI runtime (see
 * `WishlistJsRuntime`). Assigning it only on the RN main `global` from this
 * module meant iOS never ran pool teardown → stale RNGH + handler entries
 * after fast scroll / navigation ("ghost" presses on the next screen).
 */
export function installWishlistWorkletGestureDrop() {
  if (_installedWorkletGestureDrop) {
    return;
  }
  _installedWorkletGestureDrop = true;

  const dropOnPoolReturnWorklet = (tag: number) => {
    'worklet';
    if (typeof global.dropHandlers === 'function') {
      global.dropHandlers(tag);
    }
    dropGestureHandlerNative(tag);
  };

  const dropOnPoolReturnMain = (tag: number) => {
    if (typeof global.dropHandlers === 'function') {
      global.dropHandlers(tag);
    }
    dropGestureHandlerNative(tag);
  };

  if (wishlistContext == null) {
    // Android: wishlist runs on the RN runtime (`WishlistJsRuntime.android.ts`).
    global.dropGestureHandler = dropOnPoolReturnMain;
    return;
  }

  void wishlistContext.runAsync(() => {
    'worklet';
    global.dropGestureHandler = dropOnPoolReturnWorklet;
  });
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

const attachGestureHandler = createRunInJsFn((tag: number) => {
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
});

const PressableView = createTemplateComponent(View, {
  addProps: (item, props) => {
    'worklet';

    const tag = item.getTag();
    item.addProps(props);

    getUIInflatorRegistry().addPushChildrenCallback(() => {
      attachGestureHandler(tag);
    });
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
