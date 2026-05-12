import React, { forwardRef } from 'react';
import { DeviceEventEmitter, NativeModules, View, ViewProps } from 'react-native';
import { createTemplateComponent } from '../createTemplateComponent';
import { useTemplateCallback } from '../EventHandler';
import { getUIInflatorRegistry } from '../InflatorRepository';
import { createRunInWishlistFn, createRunInJsFn } from '../WishlistJsRuntime';

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
// our auto-generated tags don't collide with user-created gestures.
let _handlerTag = 100000;

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

let _gestureListenerInstalled = false;
function installGestureListener() {
  if (_gestureListenerInstalled) {
    return;
  }
  _gestureListenerInstalled = true;
  DeviceEventEmitter.addListener(
    'onGestureHandlerStateChange',
    (event: { handlerTag: number; state: number }) => {
      const viewTag = _handlerTagToViewTag.get(event.handlerTag);
      if (viewTag == null) {
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
  RNGestureHandlerModule.createGestureHandler(
    'TapGestureHandler',
    handlerTag,
    {},
  );
  RNGestureHandlerModule.attachGestureHandler(
    handlerTag,
    tag,
    ActionType.JS_FUNCTION_OLD_API,
  );
  RNGestureHandlerModule.flushOperations();
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
