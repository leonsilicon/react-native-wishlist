export type WishlistMode = 'native' | 'javascript';

let defaultMode: WishlistMode = 'native';

export function setDefaultWishlistMode(mode: WishlistMode) {
  defaultMode = mode;
}

export function getDefaultWishlistMode(): WishlistMode {
  return defaultMode;
}

export function resolveWishlistMode(
  modeProp: WishlistMode | undefined,
): WishlistMode {
  return modeProp ?? defaultMode;
}
