import {
  createWorkletRuntime,
  runOnRuntime,
  scheduleOnRN,
  type WorkletRuntime,
} from 'react-native-worklets';

// Dedicated worklet runtime for all wishlist worklet work (inflation, mappings,
// event handlers, pressable gesture dispatch). Having our own runtime — instead
// of sharing the Reanimated UI runtime — keeps wishlist scroll inflation from
// queueing behind Reanimated animation frames (and vice versa). This matches
// the pre-migration `react-native-worklets-core` build architecture (where
// `wishlistContext = Worklets.createContext('wishlist')` ran wishlist worklets
// on a dedicated thread/runtime) and is what makes scrolling buttery smooth.
let wishlistRuntime: WorkletRuntime | undefined;

function getWishlistRuntime(): WorkletRuntime {
  if (!wishlistRuntime) {
    wishlistRuntime = createWorkletRuntime({ name: 'wishlist' });
  }
  return wishlistRuntime;
}

// Hand the dedicated runtime to native (`WishlistJsRuntime`) so JS-side worklets
// and the library's native side share the SAME JSI runtime — registries
// (`global.__wishlistInflatorRegistry`, `global.handlers`, `global.handleEvent`,
// `global.dropGestureHandler`, `global.wishlists`) all live there. Native
// unwraps the `WorkletRuntime` HostObject via `dynamic_pointer_cast` (same
// `.so`-boundary cast pattern the pre-migration worklets-core integration
// relied on).
export function bindNativeWishlistContext() {
  const setNativeContext = (global as any).__mgWishlistSetContext;
  if (typeof setNativeContext !== 'function') {
    return;
  }
  setNativeContext(getWishlistRuntime());
}

export function createRunInWishlistFn<A extends unknown[]>(
  fn: (...args: A) => unknown,
): (...args: A) => void {
  return runOnRuntime(getWishlistRuntime(), fn);
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
