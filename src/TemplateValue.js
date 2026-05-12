import { useEffect, useMemo } from 'react';
import { getUIInflatorRegistry } from './InflatorRepository';
import { generateId } from './Utils';
import { createRunInWishlistFn } from './WishlistJsRuntime';
export function createTemplateValue(mapper) {
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
        const registry = getUIInflatorRegistry();
        const state = getOrCreateUIState();
        if (state.dirty) {
            state.current = mapper(registry.getCurrentValue(), registry.getCurrentRootValue());
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
    return {
        __isTemplateValue: true,
        __remove: remove,
        value,
    };
}
export function isTemplateValue(value) {
    return (value !== null &&
        typeof value === 'object' &&
        value.__isTemplateValue === true);
}
export function useTemplateValue(mapper) {
    const value = useMemo(() => {
        return createTemplateValue(mapper);
    }, [mapper]);
    useEffect(() => {
        return () => value.__remove();
    }, [value]);
    return value;
}
