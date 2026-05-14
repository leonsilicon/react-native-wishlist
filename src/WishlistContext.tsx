import { createContext, useContext } from 'react';
import type { WishlistMode } from './WishlistMode';

export const WishlistContext = createContext<{
  id: string;
  inflatorId: string;
  data: Object;
  mode: WishlistMode;
} | null>(null);

export function useWishlistContext() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw Error('Must be rendered inside a Template component.');
  }
  return context;
}

export function useWishlistMode(): WishlistMode {
  const context = useContext(WishlistContext);
  return context?.mode ?? 'native';
}
