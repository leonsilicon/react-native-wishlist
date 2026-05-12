import { Worklets } from 'react-native-worklets-core';

// Dedicated worklet runtime for wishlist. Native code (`WishlistJsRuntime`)
// gets a pointer to this runtime via `__mgWishlistSetContext` (installed by
// `MGWishlistManager.installWishlistRuntime`), so JS-side worklets and the
// library's native side share state.
export const wishlistContext = Worklets.createContext('wishlist');

export function bindNativeWishlistContext() {
  const setNativeContext = (global as any).__mgWishlistSetContext;
  if (typeof setNativeContext === 'function') {
    setNativeContext(wishlistContext);
  }
}

export function createRunInWishlistFn<
  T,
  A extends unknown[] = [],
>(fn: (...args: A) => T): (...args: A) => Promise<T> {
  return wishlistContext.createRunAsync(fn) as (...args: A) => Promise<T>;
}

export const createRunInJsFn = Worklets.createRunOnJS;
