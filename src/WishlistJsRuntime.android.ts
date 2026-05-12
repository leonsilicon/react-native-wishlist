// Android currently uses the React Native runtime directly for Wishlist native
// work. Keep this module free of `react-native-worklets-core`, whose Android
// package is not registered by RN 0.83's bridgeless package delegate.
export function bindNativeWishlistContext() {
  // iOS binds a worklets-core context into native. Android initializes native
  // with the RN runtime in `WishlistManagerModule.nativeInstall`.
}

export function createRunInWishlistFn<
  T,
  A extends unknown[] = [],
>(fn: (...args: A) => T): (...args: A) => Promise<T> {
  return (...args: A) => Promise.resolve().then(() => fn(...args));
}

export function createRunInJsFn<A extends unknown[], T>(
  fn: (...args: A) => T,
): (...args: A) => T {
  return (...args: A) => fn(...args);
}
