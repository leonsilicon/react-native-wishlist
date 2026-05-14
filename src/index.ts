import { initEventHandler } from './EventHandler';
import { installWishlistWorkletGestureDrop } from './Components/Pressable';
import WishListManager from './Specs/NativeWishlistManager';
import { bindNativeWishlistContext } from './WishlistJsRuntime';

// Initialise the native pipeline lazily and tolerate its absence so that
// apps that use only `mode="javascript"` (or build without the native
// module) don't crash at module load.
try {
  initEventHandler();
  WishListManager.install();
  bindNativeWishlistContext();
  installWishlistWorkletGestureDrop();
} catch (err) {
  if (__DEV__) {
    console.warn(
      '[wishlist] Native pipeline init failed; only mode="javascript" will work.',
      err,
    );
  }
}

export {
  useTemplateValue,
  useTemplateDerivedValue,
  TemplateValue,
} from './TemplateValue';
export { createTemplateComponent } from './createTemplateComponent';
export { Wishlist, WishListInstance } from './Wishlist';
export {
  useWishlistData,
  useWishlistContextData,
  WishlistData,
} from './WishlistData';
export { createRunInJsFn, createRunInWishlistFn } from './WishlistJsRuntime';
export { renderTemplate } from './renderTemplate';
export {
  setDefaultWishlistMode,
  getDefaultWishlistMode,
  type WishlistMode,
} from './WishlistMode';
