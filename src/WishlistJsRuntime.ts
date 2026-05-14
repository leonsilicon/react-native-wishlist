import {
  getUIRuntimeHolder,
  runOnUI,
  scheduleOnRN,
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
  // `runOnJS(fn)` is itself a worklet that builds the closure on its calling
  // runtime — invoking it eagerly at JS module load returns a regular JS
  // closure that the worklets runtime cannot call back (it throws "Tried to
  // synchronously call a non-worklet anonymous function on the UI thread").
  // Build the dispatch wrapper here as an explicit worklet so it serializes
  // correctly into both runtimes and routes through `scheduleOnRN`.
  const dispatch = (...args: A) => {
    'worklet';
    scheduleOnRN(fn as (...a: A) => unknown, ...args);
  };
  return dispatch;
}
