/**
 * Minimal level shape used by the wishlist demo. Mirrors the fields this UI
 * reads from `@sanjiapp/com.leonsilicon.sanji.entities.level`.
 */
export type Level = {
  slug: string;
  characters: readonly string[];
};
