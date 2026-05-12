import './EventHandler';
import WishListManager from './Specs/NativeWishlistManager';
import { bindNativeWishlistContext } from './WishlistJsRuntime';

WishListManager.install();
bindNativeWishlistContext();

export { useTemplateValue, TemplateValue } from './TemplateValue';
export { createTemplateComponent } from './createTemplateComponent';
export { Wishlist, WishListInstance } from './Wishlist';
export {
  useWishlistData,
  useWishlistContextData,
  WishlistData,
} from './WishlistData';
export { createRunInJsFn, createRunInWishlistFn } from './WishlistJsRuntime';
export { renderTemplate } from './renderTemplate';
