import { useMemo } from 'react';
import { scheduleSyncUp } from './OrchestratorBinding';
import { useGeneratedId } from './Utils';
import { useWishlistContext } from './WishlistContext';
import { createItemsDataStructure, } from './WishlistDataCopy';
import { createRunInJsFn, createRunInWishlistFn } from './WishlistJsRuntime';
/**
 * Creates an instance of Wishlist data which can be passed to Wishlist components.
 */
export function useWishlistData(getInitialData) {
    const dataId = useGeneratedId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialData = useMemo(getInitialData, []);
    const getWishlistData = useMemo(() => {
        return () => {
            'worklet';
            if (!global.dataCtx) {
                global.dataCtx = {};
            }
            if (global.dataCtx[dataId]) {
                return global.dataCtx[dataId];
            }
            const currentlyRenderedCopy = createItemsDataStructure(initialData);
            const attachedListIds = new Set();
            const pendingUpdates = [];
            async function update(updateJob) {
                return new Promise((resolve) => {
                    pendingUpdates.push((dataCopy) => {
                        const result = updateJob(dataCopy);
                        resolve(result);
                    });
                    if (attachedListIds.size > 0) {
                        for (const id of attachedListIds) {
                            scheduleSyncUp(id);
                        }
                    }
                    else {
                        // If we are not rendering a list yet, just apply changes immediately.
                        currentlyRenderedCopy.__applyChanges(pendingUpdates);
                    }
                });
            }
            function __at(index) {
                return currentlyRenderedCopy.at(index);
            }
            function __firstIndex() {
                return 0 - currentlyRenderedCopy.__numberOfNegative;
            }
            function __lastIndex() {
                return (currentlyRenderedCopy.length -
                    currentlyRenderedCopy.__numberOfNegative);
            }
            function __attach(wishlistId) {
                attachedListIds.add(wishlistId);
                if (!global.wishlists) {
                    global.wishlists = {};
                }
                if (!global.wishlists[wishlistId]) {
                    global.wishlists[wishlistId] = {};
                }
                global.wishlists[wishlistId].listener = () => {
                    const pendingUpdatesCopy = pendingUpdates.splice(0, pendingUpdates.length);
                    return currentlyRenderedCopy.__applyChanges(pendingUpdatesCopy);
                };
            }
            function __detach(wishlistId) {
                global.wishlists[wishlistId].listener = undefined;
            }
            const internalData = {
                update,
                __at,
                __attach,
                __detach,
                __firstIndex,
                __lastIndex,
            };
            global.dataCtx[dataId] = internalData;
            return internalData;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return useMemo(() => ({
        update: (updateJob) => {
            'worklet';
            // This can be called from both JS and Wishlist context.
            // TODO: Better api to check which JS runtime we are on.
            if (global.dataCtx) {
                return getWishlistData().update(updateJob);
            }
            else {
                return new Promise((resolve) => {
                    const resolveJs = createRunInJsFn(resolve);
                    return createRunInWishlistFn(() => {
                        'worklet';
                        getWishlistData().update(updateJob).then(resolveJs);
                    })();
                });
            }
        },
        __at(index) {
            'worklet';
            return getWishlistData().__at(index);
        },
        __attach: (wishlistId) => {
            createRunInWishlistFn(() => {
                'worklet';
                getWishlistData().__attach(wishlistId);
            })();
        },
        __detach: (wishlistId) => {
            createRunInWishlistFn(() => {
                'worklet';
                getWishlistData().__detach(wishlistId);
            })();
        },
        __firstIndex: () => {
            'worklet';
            return getWishlistData().__firstIndex();
        },
        __lastIndex: () => {
            'worklet';
            return getWishlistData().__lastIndex();
        },
    }), [getWishlistData]);
}
/**
 * Returns the data for the current Wishlist. Must be called inside template components.
 */
export function useWishlistContextData() {
    const { data } = useWishlistContext();
    return data;
}
