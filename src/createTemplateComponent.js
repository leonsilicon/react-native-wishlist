import React, { forwardRef, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { TemplateCallback } from './EventHandler';
import { ForEachBase } from './Components/ForEachBase';
import InflatorRepository, { getUIInflatorRegistry, } from './InflatorRepository';
import { CaseBase } from './Components/Switch';
import { useTemplateContext } from './TemplateContext';
import { createTemplateValue, isTemplateValue, } from './TemplateValue';
import { generateId } from './Utils';
import { useWishlistContext } from './WishlistContext';
function setInObject(obj, path, value) {
    'worklet';
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = current[path[i]] ?? {};
        current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
}
function traverseObject(obj, callback) {
    const stack = [{ path: [], value: obj }];
    while (stack.length > 0) {
        const { path, value } = stack.pop();
        if (value &&
            typeof value === 'object' &&
            !isTemplateValue(value) &&
            !(value instanceof TemplateCallback) &&
            (path.length === 0 || path[path.length - 1] !== 'children')) {
            Object.keys(value).forEach((key) => {
                stack.push({ path: [...path, key], value: value[key] });
            });
        }
        else {
            callback(path, value);
        }
    }
}
function convertToTemplateValue(value, path) {
    let curTemplateType = value;
    return {
        // TODO(janic): Need to call remove for template values created here.
        templateValue: createTemplateValue(() => {
            'worklet';
            return curTemplateType;
        }),
        targetPath: path,
    };
}
export function createTemplateComponent(Component, { addProps, additionalTemplateProps } = {}) {
    const parsedAdditionalTemplateProps = additionalTemplateProps?.map((prop) => prop.split('.')) ?? [];
    const WishListComponent = forwardRef(({ style, ...props }, ref) => {
        const { inflatorId } = useWishlistContext();
        const { templateType } = useTemplateContext();
        const nativeId = useMemo(generateId, []);
        const otherPropsMemoized = useMemo(() => {
            const resolvedStyle = StyleSheet.flatten(style);
            const templateValues = [];
            const templateCallbacks = [];
            const additionalProps = [];
            const otherProps = {};
            traverseObject({ ...props, style: resolvedStyle }, (path, value) => {
                const applyHacks = () => {
                    // Text component needs to receive a string child to work properly.
                    // @ts-expect-error TODO: fix this.
                    if (path[0] === 'children' && Component === Text) {
                        setInObject(otherProps, path, ' ');
                    }
                };
                if (isTemplateValue(value)) {
                    templateValues.push({ templateValue: value, targetPath: path });
                    applyHacks();
                }
                else if (value instanceof TemplateCallback) {
                    templateCallbacks.push({
                        worklet: value.worklet,
                        // Callbacks should never be in objects.
                        eventName: value.eventName ?? path[0].replace(/^on/, 'top'),
                    });
                    // Events have a boolean prop associated to know whether the
                    // function is set or not, so we still want to pass the prop.
                    setInObject(otherProps, path, () => { });
                }
                else {
                    // @ts-expect-error TODO: fix this.
                    if (Component === ForEachBase && path[0] === 'template') {
                        templateValues.push(convertToTemplateValue(value, path));
                    }
                    if (
                    // @ts-expect-error TODO: fix this.
                    Component === CaseBase &&
                        path[0] === 'value' &&
                        !isTemplateValue(value)) {
                        templateValues.push(convertToTemplateValue(value, path));
                    }
                    if (
                    // @ts-expect-error TODO: fix this.
                    Component === Text &&
                        path[0] === 'children' &&
                        !isTemplateValue(value)) {
                        templateValues.push(convertToTemplateValue(value, path));
                    }
                    parsedAdditionalTemplateProps.forEach((additionalPath) => {
                        if (additionalPath.length === path.length &&
                            additionalPath.every((p, i) => p === path[i])) {
                            additionalProps.push({ targetPath: path, value });
                        }
                    });
                    setInObject(otherProps, path, value);
                }
            });
            InflatorRepository.registerMapping(inflatorId, nativeId, templateType, (value, templateItem, pool, rootValue) => {
                'worklet';
                const propsToSet = {};
                additionalProps.forEach(({ targetPath, value: v }) => {
                    setInObject(propsToSet, targetPath, v);
                });
                templateValues.forEach(({ templateValue, targetPath }) => {
                    setInObject(propsToSet, targetPath, templateValue.value());
                });
                templateCallbacks.forEach(({ eventName, worklet }) => {
                    templateItem.setCallback(eventName, (ev) => {
                        getUIInflatorRegistry().withCurrentValues(value, rootValue, () => {
                            worklet(ev, value, rootValue);
                        });
                    });
                });
                // Styles need to be passed as props.
                const { style: styleForProps, ...otherPropsToSet } = propsToSet;
                const finalPropsToSet = { ...otherPropsToSet, ...styleForProps };
                if (addProps) {
                    addProps(templateItem, finalPropsToSet, inflatorId, pool, rootValue);
                }
                else {
                    templateItem.addProps(finalPropsToSet);
                }
            });
            return otherProps;
            // TODO: This will change on every render, if we want this memo to work properly we need
            // to shallow compare the props object.
        }, [inflatorId, nativeId, props, style, templateType]);
        // @ts-expect-error: this is ok.
        return React.createElement(Component, { ...otherPropsMemoized, ref: ref, nativeID: nativeId });
    });
    WishListComponent.displayName = `WishList(${Component.displayName})`;
    return WishListComponent;
}
