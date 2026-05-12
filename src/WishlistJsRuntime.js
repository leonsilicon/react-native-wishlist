import { runOnJS, runOnUIAsync } from 'react-native-worklets';
export function createRunInWishlistFn(fn) {
    return (...args) => runOnUIAsync(fn, ...args);
}
export const createRunInJsFn = runOnJS;
