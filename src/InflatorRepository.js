import { getColorsUIModule } from './Colors';
import { wrapComponentPool, } from './ComponentPool';
import { createRunInWishlistFn } from './WishlistJsRuntime';
let done = false;
const maybeInit = () => {
    if (!done) {
        done = true;
        createRunInWishlistFn(() => {
            'worklet';
            const registry = new Map();
            const mappings = new Map();
            const templateValueStates = new Map();
            let pushChildrenCallbacks = [];
            let currentValue;
            let currentRootValue;
            const inflatorRegistry = {
                inflateItem: (id, index, nativePool, prevItem) => {
                    const pool = wrapComponentPool(nativePool);
                    const inflator = registry.get(id);
                    if (inflator) {
                        const result = inflator(index, pool, prevItem);
                        if (!result) {
                            return result;
                        }
                        const [item, value] = result;
                        return inflatorRegistry.useMappings(item, value, value.type, id, pool, value);
                    }
                    else {
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
                registerMapping: (inflatorId, nativeId, templateType, inflateMethod) => {
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
                    const result = {};
                    for (const [key, value] of Object.entries(props)) {
                        if (colors.colorProps.includes(key)) {
                            result[key] = colors.processColor(value);
                        }
                        else {
                            result[key] = value;
                        }
                    }
                    return result;
                },
            };
            global.__wishlistInflatorRegistry = inflatorRegistry;
        })();
    }
};
export function getUIInflatorRegistry() {
    'worklet';
    return global.__wishlistInflatorRegistry;
}
export default class InflatorRepository {
    static register(id, inflateMethod) {
        maybeInit();
        createRunInWishlistFn(() => {
            'worklet';
            getUIInflatorRegistry().registerInflator(id, inflateMethod);
        })();
    }
    static unregister(id) {
        maybeInit();
        createRunInWishlistFn(() => {
            'worklet';
            getUIInflatorRegistry().unregisterInflator(id);
        })();
    }
    static registerMapping(inflatorId, nativeId, templateType, inflateMethod) {
        maybeInit();
        createRunInWishlistFn(() => {
            'worklet';
            getUIInflatorRegistry().registerMapping(inflatorId, nativeId, templateType, inflateMethod);
        })();
    }
}
