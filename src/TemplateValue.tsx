import { useEffect, useMemo } from 'react';
import { getUIInflatorRegistry } from './InflatorRepository';
import { getJsInflatorRegistry } from './JsInflatorRegistry';
import { generateId } from './Utils';
import { createRunInWishlistFn } from './WishlistJsRuntime';

export type TemplateValueMapper<ItemT, ValueT> = (
  item: ItemT,
  rootValue: any,
) => ValueT;

// Object cloned by reanimated are feezed so we store mutation state in a
// side map.
export type TemplateValueUIState = {
  current: any;
  dirty: boolean;
};

export type TemplateValue<ValueT> = {
  value: () => ValueT;
};

export type TemplateValueInternal<ValueT> = TemplateValue<ValueT> & {
  __isTemplateValue: boolean;
  __remove: () => void;
  // JS-mode entry: calls the mapper with explicit (item, rootValue) instead
  // of reading from a runtime-local current-value slot. Lets callers in the
  // React render path resolve template values without relying on a global
  // or context that may not be set at descendant render time.
  __resolveJs: (item: unknown, rootValue: unknown) => ValueT;
};

export function createTemplateValue<ValueT>(
  mapper: TemplateValueMapper<any, ValueT>,
): TemplateValueInternal<ValueT> {
  const id = generateId();

  function getOrCreateUIState() {
    'worklet';

    const registry = getUIInflatorRegistry();
    let state = registry.getTemplateValueState(id);
    if (!state) {
      state = {
        dirty: true,
        current: undefined,
      };
      registry.setTemplateValueState(id, state);
    }

    return state;
  }

  function value() {
    'worklet';

    // JS-mode entry: when this is called from the React render thread (not a
    // worklet), the wishlist worklet registry isn't installed on `global`.
    // Route through the JS-side registry populated by JavascriptWishlist.
    if (!global.__wishlistInflatorRegistry) {
      const jsRegistry = getJsInflatorRegistry();
      let state = jsRegistry.getTemplateValueState(id);
      if (!state) {
        state = { dirty: true, current: undefined };
        jsRegistry.setTemplateValueState(id, state);
      }
      if (state.dirty) {
        state.current = mapper(
          jsRegistry.getCurrentValue(),
          jsRegistry.getCurrentRootValue(),
        );
        state.dirty = false;
      }
      return state.current;
    }

    const registry = getUIInflatorRegistry();
    const state = getOrCreateUIState();
    if (state.dirty) {
      state.current = mapper(
        registry.getCurrentValue(),
        registry.getCurrentRootValue(),
      );
      state.dirty = false;
    }

    return state.current;
  }

  function remove() {
    createRunInWishlistFn(() => {
      'worklet';

      getUIInflatorRegistry().deleteTemplateValueState(id);
    });
  }

  function __resolveJs(item: unknown, rootValue: unknown): ValueT {
    return mapper(item, rootValue);
  }

  return {
    __isTemplateValue: true,
    __remove: remove,
    __resolveJs,
    value,
  };
}

export function isTemplateValue(
  value: unknown,
): value is TemplateValueInternal<any> {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as any).__isTemplateValue === true
  );
}

/**
 * The `mapper` runs on the worklets UI runtime. Mark it (and any nested
 * function literals it passes to helpers like `Array#reduce`) with a leading
 * `'worklet';` statement so the worklets babel plugin compiles it.
 */
export function useTemplateValue<ItemT, ValueT>(
  mapper: TemplateValueMapper<ItemT, ValueT>,
): TemplateValue<ValueT> {
  const value = useMemo(() => {
    return createTemplateValue(mapper);
  }, [mapper]);

  useEffect(() => {
    return () => value.__remove();
  }, [value]);

  return value;
}

/**
 * Sugar over {@link useTemplateValue} for composing other `TemplateValue`s
 * (and reading any worklet-runtime state) without taking the `(item, root)`
 * arguments yourself. The `deriver` runs on the wishlist worklet runtime on
 * every inflation, so calls to `other.value()` inside it always read the
 * current item's state.
 *
 * This is not a bridge to `react-native-reanimated` — reanimated `SharedValue`s
 * live in a different runtime and are not readable here.
 */
export function useTemplateDerivedValue<ValueT>(
  deriver: () => ValueT,
): TemplateValue<ValueT> {
  return useTemplateValue(() => {
    'worklet';
    return deriver();
  });
}
