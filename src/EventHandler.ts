import { useMemo } from 'react';
import { createRunInWishlistFn } from './WishlistJsRuntime';

// Older React Native versions exposed `global.global`. Newer versions only
// set `global.window` and `global.self`, so the wishlist native code, which
// reads `global.global.handlers` / `global.global.handleEvent`, needs the
// alias re-established before any events fire. This must run at module load
// because the native event observer is registered as soon as the TurboModule
// loads — before any Wishlist component renders.
const setupRuntimeGlobals = () => {
  if (global.global === undefined) {
    global.global = global;
  }
  global.handlers = global.handlers ?? {};
  global.handleEvent = (type: string, tag: number, event: any) => {
    const key = tag.toString() + type.replace(/^topOn/, 'on');
    const callback = global.handlers[key];
    if (callback) {
      callback(event);
    }
  };
};

setupRuntimeGlobals();

let done = false;
const maybeInit = () => {
  if (!done) {
    done = true;
    // Mirror the same setup on the worklets UI runtime — that's where
    // `WishlistJsRuntime` lives natively, so its `handleEvent` lookup happens
    // there.
    createRunInWishlistFn(() => {
      'worklet';
      if (global.global === undefined) {
        global.global = global;
      }
      global.handlers = global.handlers ?? {};
      global.handleEvent = (type: string, tag: number, event: any) => {
        'worklet';
        const key = tag.toString() + type.replace(/^topOn/, 'on');
        const callback = global.handlers[key];
        if (callback) {
          callback(event);
        }
      };
    })();
  }
};

export type TemplateCallbackWorklet = (
  nativeEvent: any,
  value: any,
  rootValue: any,
) => unknown;

export class TemplateCallback {
  worklet: TemplateCallbackWorklet;
  eventName: string | undefined;

  constructor(worklet: TemplateCallbackWorklet, eventName?: string) {
    this.worklet = worklet;
    this.eventName = eventName;
  }
}

export function useTemplateCallback(
  worklet: (nativeEvent: any, value: any, rootValue: any) => unknown,
  eventName?: string,
) {
  return useMemo(() => {
    return new TemplateCallback(worklet, eventName);
  }, [worklet, eventName]);
}

export function initEventHandler() {
  maybeInit();
}
