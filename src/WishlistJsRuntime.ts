import {
  getUIRuntimeHolder,
  runOnJS,
  runOnUI,
} from 'react-native-worklets';

// Native wishlist code (`WishlistJsRuntime`) shares state with JS-side worklets
// by reusing the worklets UI runtime. We hand its host object to native via
// `__mgWishlistSetContext` (installed by `MGWishlistManager.installWishlistRuntime`)
// so registries, `global.handleEvent`, and the gesture-handler bridge live on
// the same JSI runtime on both sides.
export function bindNativeWishlistContext() {
  const setNativeContext = (global as any).__mgWishlistSetContext;
  if (typeof setNativeContext !== 'function') {
    return;
  }
  setNativeContext(getUIRuntimeHolder());
}

export function createRunInWishlistFn<A extends unknown[]>(
  fn: (...args: A) => unknown,
): (...args: A) => void {
  return runOnUI(fn);
}

export function createRunInJsFn<A extends unknown[], T>(
  fn: (...args: A) => T,
): (...args: A) => void {
  return runOnJS(fn);
}
