import { initEventHandler } from './EventHandler';
import { installWishlistWorkletGestureDrop } from './Components/Pressable';
import WishListManager from './Specs/NativeWishlistManager';
import { bindNativeWishlistContext } from './WishlistJsRuntime';

initEventHandler();
WishListManager.install();
bindNativeWishlistContext();
installWishlistWorkletGestureDrop();

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
