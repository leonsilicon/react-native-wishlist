import { runOnUISync } from 'react-native-worklets';
import { getColorsUIModule } from './Colors';
import {
  ComponentPool,
  NativeComponentPool,
  wrapComponentPool,
} from './ComponentPool';
import { TemplateItem } from './TemplateItem';
import type { TemplateValueUIState } from './TemplateValue';
import { createRunInWishlistFn } from './WishlistJsRuntime';

export type InflateMethod = (
  index: number,
  pool: ComponentPool,
  previousItem: TemplateItem | null,
) => [TemplateItem, any] | undefined;

export type MappingInflateMethod = (
  value: unknown,
  templateItem: TemplateItem,
  pool: ComponentPool,
  rootValue: unknown,
) => void;

export type UIInflatorRegistry = {
  inflateItem: (
    id: string,
    index: number,
    pool: NativeComponentPool,
    prevItem: TemplateItem | null,
  ) => TemplateItem | undefined;
  registerInflator: (id: string, inflateMethod: InflateMethod) => void;
  unregisterInflator: (id: string) => void;
  registerMapping: (
    inflatorId: string,
    nativeId: string,
    templateType: string,
    inflateMethod: MappingInflateMethod,
  ) => void;
  useMappings: (
    item: TemplateItem,
    value: unknown,
    templateType: string,
    id: string,
    pool: ComponentPool,
    rootValue: unknown,
  ) => TemplateItem;
  getTemplateValueState: (id: string) => TemplateValueUIState | undefined;
  setTemplateValueState: (id: string, state: TemplateValueUIState) => void;
  deleteTemplateValueState: (id: string) => void;
  getCurrentValue: () => unknown;
  getCurrentRootValue: () => unknown;
  withCurrentValues: (
    value: unknown,
    rootValue: unknown,
    callback: () => void,
  ) => void;
  didPushChildren: () => void;
  addPushChildrenCallback: (callback: () => void) => void;
  processProps: (props: any) => any;
};

const buildInflatorRegistry = (): UIInflatorRegistry => {
  'worklet';

  const registry = new Map<string, InflateMethod>();
  const mappings = new Map<
    string,
    Map<string, Map<string, MappingInflateMethod>>
  >();
  const templateValueStates = new Map<string, TemplateValueUIState>();
  let pushChildrenCallbacks: (() => void)[] = [];
  let currentValue: unknown;
  let currentRootValue: unknown;

  const inflatorRegistry: UIInflatorRegistry = {
    inflateItem: (id, index, nativePool, prevItem) => {
      const pool = wrapComponentPool(nativePool);
      const inflator = registry.get(id);
      if (inflator) {
        const result = inflator(index, pool, prevItem);
        if (!result) {
          return result;
        }
        const [item, value] = result;

        return inflatorRegistry.useMappings(
          item,
          value,
          value.type,
          id,
          pool,
          value, // rootValue
        );
      } else {
        console.log('Inflator not found for id: ' + id);
        return undefined;
      }
    },
    useMappings: (item, value, templateType, id, pool, rootValue) => {
      // We need to save and restore current values to support things like ForEach
      // where current value can change.
      inflatorRegistry.withCurrentValues(value, rootValue, () => {
        const mapping = mappings.get(id)?.get(templateType);
        if (mapping) {
          for (const [nativeId, inflate] of mapping.entries()) {
            const templateItem = item.getByWishId(nativeId);
            if (templateItem) {
              templateValueStates.clear();
              inflate(value, templateItem, pool, rootValue);
            }
          }
        }
      });
      return item;
    },
    registerInflator: (id, inflateMethod) => {
      registry.set(id, inflateMethod);
    },
    unregisterInflator: (id) => {
      // TODO(Szymon) It should be done on UI Thread as it may be still in use
      registry.delete(id);
      mappings.delete(id);
    },
    registerMapping: (
      inflatorId: string,
      nativeId: string,
      templateType: string,
      inflateMethod: MappingInflateMethod,
    ) => {
      const mapping = mappings.get(inflatorId) ?? new Map();
      const innerMapping = mapping.get(templateType) ?? new Map();
      innerMapping.set(nativeId, inflateMethod);
      mapping.set(templateType, innerMapping);
      mappings.set(inflatorId, mapping);
    },
    getTemplateValueState: (id) => {
      return templateValueStates.get(id);
    },
    setTemplateValueState: (id, state) => {
      templateValueStates.set(id, state);
    },
    deleteTemplateValueState: (id) => {
      templateValueStates.delete(id);
    },
    withCurrentValues: (value, rootValue, callback) => {
      templateValueStates.clear();
      const previousValue = currentValue;
      const previousRootValue = currentRootValue;
      currentValue = value;
      currentRootValue = rootValue;
      callback();
      currentValue = previousValue;
      currentRootValue = previousRootValue;
    },
    getCurrentValue: () => {
      return currentValue;
    },
    getCurrentRootValue: () => {
      return currentRootValue;
    },
    // TODO: Scope this by wishlist
    didPushChildren: () => {
      pushChildrenCallbacks.forEach((cb) => cb());
      pushChildrenCallbacks = [];
    },
    addPushChildrenCallback: (callback) => {
      pushChildrenCallbacks.push(callback);
    },
    processProps: (props) => {
      const colors = getColorsUIModule();
      const result: any = {};
      for (const [key, value] of Object.entries(props)) {
        if (colors.colorProps.includes(key)) {
          result[key] = colors.processColor(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    },
  };
  return inflatorRegistry;
};

// On the JS runtime we install a thin proxy whose methods dispatch synchronously
// to the real registry living on the worklets UI runtime. The native side reads
// `global.__wishlistInflatorRegistry` via `WishlistJsRuntime` (the JS runtime),
// so without a proxy here the lookups throw `getPropertyAsObject: property
// '__wishlistInflatorRegistry' is undefined`. By forwarding through
// `runOnUISync` we keep a single source of truth on the UI runtime where the
// inflators (which are worklets) actually need to execute.
const buildInflatorRegistryProxy = (): UIInflatorRegistry => {
  const proxy: UIInflatorRegistry = {
    inflateItem: (id, index, nativePool, prevItem) =>
      runOnUISync(() => {
        'worklet';
        return global.__wishlistInflatorRegistry.inflateItem(
          id,
          index,
          nativePool,
          prevItem,
        );
      }),
    registerInflator: (id, inflateMethod) => {
      runOnUISync(() => {
        'worklet';
        global.__wishlistInflatorRegistry.registerInflator(id, inflateMethod);
      });
    },
    unregisterInflator: (id) => {
      runOnUISync(() => {
        'worklet';
        global.__wishlistInflatorRegistry.unregisterInflator(id);
      });
    },
    registerMapping: (inflatorId, nativeId, templateType, inflateMethod) => {
      runOnUISync(() => {
        'worklet';
        global.__wishlistInflatorRegistry.registerMapping(
          inflatorId,
          nativeId,
          templateType,
          inflateMethod,
        );
      });
    },
    useMappings: (item, value, templateType, id, pool, rootValue) =>
      runOnUISync(() => {
        'worklet';
        return global.__wishlistInflatorRegistry.useMappings(
          item,
          value,
          templateType,
          id,
          pool,
          rootValue,
        );
      }),
    getTemplateValueState: (id) =>
      runOnUISync(() => {
        'worklet';
        return global.__wishlistInflatorRegistry.getTemplateValueState(id);
      }),
    setTemplateValueState: (id, state) => {
      runOnUISync(() => {
        'worklet';
        global.__wishlistInflatorRegistry.setTemplateValueState(id, state);
      });
    },
    deleteTemplateValueState: (id) => {
      runOnUISync(() => {
        'worklet';
        global.__wishlistInflatorRegistry.deleteTemplateValueState(id);
      });
    },
    withCurrentValues: (value, rootValue, callback) => {
      runOnUISync(() => {
        'worklet';
        global.__wishlistInflatorRegistry.withCurrentValues(
          value,
          rootValue,
          callback,
        );
      });
    },
    getCurrentValue: () =>
      runOnUISync(() => {
        'worklet';
        return global.__wishlistInflatorRegistry.getCurrentValue();
      }),
    getCurrentRootValue: () =>
      runOnUISync(() => {
        'worklet';
        return global.__wishlistInflatorRegistry.getCurrentRootValue();
      }),
    didPushChildren: () => {
      runOnUISync(() => {
        'worklet';
        global.__wishlistInflatorRegistry.didPushChildren();
      });
    },
    addPushChildrenCallback: (callback) => {
      runOnUISync(() => {
        'worklet';
        global.__wishlistInflatorRegistry.addPushChildrenCallback(callback);
      });
    },
    processProps: (props) =>
      runOnUISync(() => {
        'worklet';
        return global.__wishlistInflatorRegistry.processProps(props);
      }),
  };
  return proxy;
};

let done = false;
const maybeInit = () => {
  if (!done) {
    done = true;
    // The real registry lives on the worklets UI runtime, where worklet
    // inflators are serialized and executed.
    createRunInWishlistFn(() => {
      'worklet';
      global.__wishlistInflatorRegistry = buildInflatorRegistry();
    })();
    // The native side reads `global.__wishlistInflatorRegistry` from the JS
    // runtime (via `WishlistJsRuntime`, which is initialised with
    // `cxxBridge.runtime`). We install a forwarding proxy here so calls from
    // native are funnelled to the UI-runtime registry synchronously.
    global.__wishlistInflatorRegistry = buildInflatorRegistryProxy();
  }
};

export function getUIInflatorRegistry(): UIInflatorRegistry {
  'worklet';

  return global.__wishlistInflatorRegistry;
}

export default class InflatorRepository {
  static register(id: string, inflateMethod: InflateMethod) {
    maybeInit();
    createRunInWishlistFn(() => {
      'worklet';
      getUIInflatorRegistry().registerInflator(id, inflateMethod);
    })();
  }

  static unregister(id: string) {
    maybeInit();
    createRunInWishlistFn(() => {
      'worklet';
      getUIInflatorRegistry().unregisterInflator(id);
    })();
  }

  static registerMapping(
    inflatorId: string,
    nativeId: string,
    templateType: string,
    inflateMethod: MappingInflateMethod,
  ) {
    maybeInit();
    createRunInWishlistFn(() => {
      'worklet';
      getUIInflatorRegistry().registerMapping(
        inflatorId,
        nativeId,
        templateType,
        inflateMethod,
      );
    })();
  }
}
