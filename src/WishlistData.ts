import { useMemo } from 'react';
import { scheduleSyncUp } from './OrchestratorBinding';
import { useGeneratedId } from './Utils';
import { useWishlistContext } from './WishlistContext';
import {
  createItemsDataStructure,
  DataCopy,
  Item,
  UpdateJob,
} from './WishlistDataCopy';
import { createRunInJsFn, createRunInWishlistFn } from './WishlistJsRuntime';

export interface WishlistData<T extends Item> {
  update: <ResT>(job: UpdateJob<T, ResT>) => Promise<ResT>;
}

export interface WishlistDataInternal<T extends Item> extends WishlistData<T> {
  __attach: (wishlistId: string) => void;
  __detach: (wishlistId: string) => void;
  __at: (index: number) => T | undefined;
  __firstIndex: () => number;
  __lastIndex: () => number;
  // JS-mode entry points: read current items synchronously on JS thread
  // and subscribe to changes for re-rendering.
  __jsGetItems: () => unknown[];
  __jsSubscribe: (listener: () => void) => () => void;
}

/**
 * Creates an instance of Wishlist data which can be passed to Wishlist components.
 */
export function useWishlistData<T extends Item>(
  getInitialData: () => Array<T>,
): WishlistData<T> {
  const dataId = useGeneratedId();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialData = useMemo(getInitialData, []);

  // JS-mode mirror: stays in sync with every update() call, drives
  // re-renders for any <Wishlist.Component mode="javascript"> using this
  // data instance. Independent of the worklet runtime so it never pulls
  // in native code paths.
  const jsMirror = useMemo(() => {
    let items: T[] = initialData.slice();
    const listeners = new Set<() => void>();
    const jsCopy = createItemsDataStructure(items);
    return {
      get: () => items,
      apply: (job: UpdateJob<T, unknown>) => {
        const result = job(jsCopy);
        // After a job mutates the data structure, snapshot the current
        // deque so consumers get a fresh array reference (LegendList
        // diffs by reference / keys).
        items = (jsCopy as any).__deque.slice();
        for (const l of listeners) l();
        return result;
      },
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getWishlistData = useMemo((): (() => WishlistDataInternal<T>) => {
    return () => {
      'worklet';

      if (!global.dataCtx) {
        global.dataCtx = {};
      }

      if (global.dataCtx[dataId]) {
        return global.dataCtx[dataId] as WishlistDataInternal<T>;
      }

      const currentlyRenderedCopy = createItemsDataStructure(initialData);
      const attachedListIds = new Set<string>();
      const pendingUpdates: Array<UpdateJob<T, unknown>> = [];

      async function update<ResT>(updateJob: UpdateJob<T, ResT>) {
        return new Promise<ResT>((resolve) => {
          pendingUpdates.push((dataCopy: DataCopy<T>) => {
            const result = updateJob(dataCopy);
            resolve(result);
          });
          if (attachedListIds.size > 0) {
            // Flag every attached binding so the native viewport carer knows
            // to invoke the listener on the next scroll/vsync. Without this,
            // the C++ fast-path skip in `MGDataBindingImpl` would never wake
            // up and pending updates would never be applied.
            if (global.wishlists) {
              for (const id of attachedListIds) {
                const b = global.wishlists[id];
                if (b) {
                  b.__hasPendingUpdates = true;
                }
              }
            }
            for (const id of attachedListIds) {
              scheduleSyncUp(id);
            }
          } else {
            // If we are not rendering a list yet, just apply changes immediately.
            currentlyRenderedCopy.__applyChanges(pendingUpdates);
          }
        });
      }

      function __at(index: number) {
        return currentlyRenderedCopy.at(index);
      }

      function __firstIndex() {
        return 0 - currentlyRenderedCopy.__numberOfNegative;
      }

      function __lastIndex() {
        return (
          currentlyRenderedCopy.length -
          currentlyRenderedCopy.__numberOfNegative
        );
      }

      function __attach(wishlistId: string) {
        attachedListIds.add(wishlistId);

        if (!global.wishlists) {
          global.wishlists = {};
        }
        if (!global.wishlists[wishlistId]) {
          global.wishlists[wishlistId] = {};
        }
        // Hot-path flag read from C++ on every scroll event: lets the native
        // viewport carer skip the JS listener call (and a JSI<->C++ Array round
        // trip) when there is nothing to apply. Set by `update`, cleared after
        // we drain `pendingUpdates`. Critical for smooth scroll on Android.
        global.wishlists[wishlistId].__hasPendingUpdates = false;
        global.wishlists[wishlistId].listener = () => {
          const pendingUpdatesCopy = pendingUpdates.splice(
            0,
            pendingUpdates.length,
          );
          const result =
            currentlyRenderedCopy.__applyChanges(pendingUpdatesCopy);
          global.wishlists[wishlistId].__hasPendingUpdates = false;
          return result;
        };
      }

      function __detach(wishlistId: string) {
        global.wishlists[wishlistId].listener = undefined;
        global.wishlists[wishlistId].__hasPendingUpdates = false;
      }

      // Worklet-side handle: only carries the methods the worklet runtime
      // ever calls. JS-only members (`__jsGetItems`, `__jsSubscribe`) live
      // on the outer JS-side object and are intentionally absent here.
      const internalData = {
        update,
        __at,
        __attach,
        __detach,
        __firstIndex,
        __lastIndex,
      } as unknown as WishlistDataInternal<T>;

      global.dataCtx[dataId] = internalData;

      return internalData;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    (): WishlistDataInternal<T> => ({
      update: <ResT>(updateJob: UpdateJob<T, ResT>) => {
        'worklet';

        // Always mirror the update to the JS-side copy so any
        // <Wishlist.Component mode="javascript"> attached to this data
        // re-renders immediately. Cheap; runs once on the JS thread.
        const jsResult = jsMirror.apply(updateJob as UpdateJob<T, unknown>);

        // This can be called from both JS and Wishlist context.
        // TODO: Better api to check which JS runtime we are on.
        if (global.dataCtx) {
          return getWishlistData().update(updateJob);
        } else if (typeof (global as any).__mgWishlistSetContext !== 'function') {
          // No native runtime available (JS-only build / mode='javascript'
          // only). Resolve synchronously with the JS-mirror result.
          return Promise.resolve(jsResult as ResT);
        } else {
          return new Promise<ResT>((resolve) => {
            const resolveJs = createRunInJsFn(resolve);
            return createRunInWishlistFn(() => {
              'worklet';

              getWishlistData().update(updateJob).then(resolveJs);
            })();
          });
        }
      },
      __at(index: number) {
        'worklet';

        return getWishlistData().__at(index);
      },
      __attach: (wishlistId: string) => {
        createRunInWishlistFn(() => {
          'worklet';
          getWishlistData().__attach(wishlistId);
        })();
      },
      __detach: (wishlistId: string) => {
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
      __jsGetItems: () => jsMirror.get(),
      __jsSubscribe: (listener: () => void) => jsMirror.subscribe(listener),
    }),
    [getWishlistData, jsMirror],
  );
}

/**
 * Returns the data for the current Wishlist. Must be called inside template components.
 */
export function useWishlistContextData<T extends Item>() {
  const { data } = useWishlistContext();
  return data as WishlistData<T>;
}
