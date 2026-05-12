import { runOnJS, runOnUIAsync } from 'react-native-worklets';

export function createRunInWishlistFn<
  T,
  A extends unknown[] = [],
>(fn: (...args: A) => T): (...args: A) => Promise<T> {
  return (...args: A) => runOnUIAsync(fn, ...args);
}

export const createRunInJsFn = runOnJS;
