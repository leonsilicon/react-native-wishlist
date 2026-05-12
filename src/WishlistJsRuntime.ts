import { Platform } from 'react-native';
import type {
  IWorkletContext,
  IWorkletNativeApi,
} from 'react-native-worklets-core';

declare const require: (
  moduleName: 'react-native-worklets-core',
) => { Worklets: IWorkletNativeApi };

const Worklets =
  Platform.OS === 'android'
    ? undefined
    : require('react-native-worklets-core').Worklets;

const runOnCurrentRuntime = <T, A extends unknown[]>(
  fn: (...args: A) => T,
): ((...args: A) => Promise<T>) => {
  return (...args: A) => Promise.resolve().then(() => fn(...args));
};

// Dedicated worklet runtime for wishlist. Native code (`WishlistJsRuntime`)
// gets a pointer to this runtime via `__mgWishlistSetContext` (installed by
// `MGWishlistManager.installWishlistRuntime`), so JS-side worklets and the
// library's native side share state.
export const wishlistContext: IWorkletContext | undefined =
  Worklets?.createContext('wishlist');

export function bindNativeWishlistContext() {
  if (!wishlistContext) {
    return;
  }

  const setNativeContext = (global as any).__mgWishlistSetContext;
  if (typeof setNativeContext === 'function') {
    setNativeContext(wishlistContext);
  }
}

export function createRunInWishlistFn<
  T,
  A extends unknown[] = [],
>(fn: (...args: A) => T): (...args: A) => Promise<T> {
  if (!wishlistContext) {
    return runOnCurrentRuntime(fn);
  }

  return wishlistContext.createRunAsync(fn) as (...args: A) => Promise<T>;
}

export function createRunInJsFn<A extends unknown[], T>(
  fn: (...args: A) => T,
): (...args: A) => Promise<T> {
  if (!Worklets) {
    return runOnCurrentRuntime(fn);
  }

  return Worklets.createRunOnJS(fn);
}
