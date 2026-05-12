import React, { createContext, useContext, useEffect, useImperativeHandle, useMemo, useRef, } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, } from 'react-native';
import { ForEach } from './Components/ForEach';
import { IF } from './Components/IF';
import { Pressable } from './Components/Pressable';
import { Case, Switch } from './Components/Switch';
import { WishlistImage } from './Components/WishlistImage';
import { WishlistText } from './Components/WishlistText';
import { WishlistView } from './Components/WishlistView';
import { initEventHandler } from './EventHandler';
import InflatorRepository from './InflatorRepository';
import NativeContentContainer from './Specs/NativeContentContainer';
import NativeTemplateContainer from './Specs/NativeTemplateContainer';
import NativeTemplateInterceptor from './Specs/NativeTemplateInterceptor';
import NativeWishList, { Commands as WishlistCommands, } from './Specs/NativeWishlist';
import { TemplateContext } from './TemplateContext';
import { generateId } from './Utils';
import { useWishlistContext, WishlistContext } from './WishlistContext';
const TemplatesRegistryContext = createContext(null);
function getTemplatesFromChildren(children, width) {
    const nextTemplates = {
        __offsetComponent: React.createElement(View, { style: [styles.offsetView, { width }] }),
        __viewComponent: React.createElement(View, null),
        __textComponent: (React.createElement(Text, null,
            React.createElement(Text, null, " "))),
        __paragraphComponent: React.createElement(Text, null, " "),
    };
    React.Children.forEach(children, (c) => {
        if (c.type.displayName === 'WishListTemplate') {
            const templateElement = c;
            nextTemplates[templateElement.props.type] = templateElement;
        }
    });
    return nextTemplates;
}
function ComponentBase({ children, style, data, contentContainerStyle, ListFooterComponent, ListHeaderComponent, ...rest }, ref) {
    const nativeWishlist = useRef(null);
    const wishlistId = useRef(null);
    if (!wishlistId.current) {
        wishlistId.current = generateId();
    }
    useImperativeHandle(ref, () => ({
        scrollToItem: (index, animated) => {
            if (nativeWishlist.current != null) {
                console.log('scrollTo', index);
                WishlistCommands.scrollToItem(nativeWishlist.current, index, animated ?? true);
            }
        },
        scrollToTop: () => {
            if (nativeWishlist.current != null) {
                WishlistCommands.scrollToItem(nativeWishlist.current, 0, true);
            }
        },
    }));
    const { width } = useWindowDimensions();
    useMemo(() => initEventHandler(), []);
    // Template registration and tracking
    const childrenTemplates = useMemo(() => getTemplatesFromChildren(children, width), [children, width]);
    if (ListHeaderComponent) {
        childrenTemplates.__wishlistHeader = React.isValidElement(ListHeaderComponent) ? (ListHeaderComponent) : (React.createElement(ListHeaderComponent, null));
    }
    if (ListFooterComponent) {
        childrenTemplates.__wishlistFooter = React.isValidElement(ListFooterComponent) ? (ListFooterComponent) : (React.createElement(ListFooterComponent, null));
    }
    const templatesRegistry = useMemo(() => ({
        templates: {},
        registerTemplate(type, component) {
            if (this.templates[type]) {
                return;
            }
            this.templates[type] = component;
        },
    }), []);
    const hasHeader = !!ListHeaderComponent;
    const hasFooter = !!ListFooterComponent;
    // Resolve inflator - either use the provided callback or use the mapping
    const resolvedInflater = useMemo(() => {
        return (index, pool, previousItem) => {
            'worklet';
            const internalData = data;
            let value;
            if (hasHeader && index === internalData.__firstIndex() - 1) {
                value = { key: '__wishlistHeader', type: '__wishlistHeader' };
            }
            else if (hasFooter && index === internalData.__lastIndex()) {
                value = { key: '__wishlistFooter', type: '__wishlistFooter' };
            }
            else {
                value = internalData.__at(index);
            }
            if (!value) {
                return undefined;
            }
            const item = previousItem != null &&
                previousItem.type === value.type &&
                previousItem.key === value.key
                ? previousItem
                : pool.getComponent(value.type);
            if (!item) {
                return undefined;
            }
            if (value.key == null) {
                throw new Error('Every data cell has to contain unique key prop!');
            }
            // We set the key of the item here so that
            // viewportObserver knows what's the key and is able to rerender it later on
            item.key = value.key;
            item.type = value.type;
            return [item, value];
        };
    }, [data, hasFooter, hasHeader]);
    const inflatorIdRef = useRef(null);
    const prevInflatorRef = useRef(undefined);
    // Inflator registration and tracking
    const inflatorId = useMemo(() => {
        if (prevInflatorRef.current !== resolvedInflater) {
            // Unregister?
            if (inflatorIdRef.current) {
                InflatorRepository.unregister(inflatorIdRef.current);
            }
            // Register
            inflatorIdRef.current = generateId();
            InflatorRepository.register(inflatorIdRef.current, resolvedInflater);
        }
        return inflatorIdRef.current;
    }, [resolvedInflater]);
    useEffect(() => {
        data.__attach(wishlistId.current);
        return () => {
            data.__detach(wishlistId.current);
        };
    }, [data]);
    const wishlistContext = useMemo(() => ({
        id: wishlistId.current,
        inflatorId,
        data,
    }), [inflatorId, data]);
    return (React.createElement(WishlistContext.Provider, { value: wishlistContext },
        React.createElement(TemplatesRegistryContext.Provider, { value: templatesRegistry },
            React.createElement(React.Fragment, null,
                React.createElement(View, { style: styles.noDisplay }, Object.keys(childrenTemplates).map((c) => (React.createElement(View, { key: c + 'prerender' },
                    React.createElement(TemplateContext.Provider, { value: { templateType: c, renderChildren: true } }, childrenTemplates[c]))))),
                React.createElement(InnerComponent, { inflatorId: inflatorId, style: style, nativeWishlist: nativeWishlist, rest: rest, templates: childrenTemplates, nestedTemplates: templatesRegistry.templates, contentContainerStyle: contentContainerStyle, initialIndex: rest.initialIndex ?? (hasHeader ? -1 : 0) })))));
}
const Component = React.forwardRef(ComponentBase);
function InnerComponent({ inflatorId, style, nativeWishlist, rest, templates, nestedTemplates, contentContainerStyle, initialIndex, }) {
    const combinedTemplates = {
        ...templates,
        ...nestedTemplates,
    };
    const { id } = useWishlistContext();
    const keys = Object.keys(combinedTemplates);
    return (React.createElement(NativeTemplateInterceptor, { style: style, collapsable: false, removeClippedSubviews: false },
        React.createElement(NativeWishList, { style: styles.flex, ref: nativeWishlist, removeClippedSubviews: false, inflatorId: inflatorId, onEndReached: rest?.onEndReached, onStartReached: rest?.onStartReached, initialIndex: initialIndex },
            React.createElement(NativeContentContainer, { collapsable: false, style: contentContainerStyle })),
        React.createElement(NativeTemplateContainer, { names: keys, inflatorId: inflatorId, wishlistId: id, key: Math.random().toString(), collapsable: false }, Object.keys(combinedTemplates).map((c) => (React.createElement(View, { key: c },
            React.createElement(TemplateContext.Provider, { value: { templateType: c } }, combinedTemplates[c])))))));
}
function Template({ children, type }) {
    const registry = useContext(TemplatesRegistryContext);
    const templates = useContext(TemplateContext);
    registry?.registerTemplate(type, children);
    return templates?.renderChildren ? children : null;
}
Template.displayName = 'WishListTemplate';
export const Wishlist = {
    Component,
    Template,
    Pressable,
    View: WishlistView,
    Image: WishlistImage,
    Text: WishlistText,
    IF,
    Switch,
    Case,
    /**
     * TODO(Szymon) It's just a prototype we have to think about matching new and old children
     * TODO(Szymon) implement setChildren
     */
    ForEach,
};
const styles = StyleSheet.create({
    flex: { flex: 1 },
    noDisplay: { display: 'none' },
    offsetView: { height: 0 },
    contentContainer: {},
});
