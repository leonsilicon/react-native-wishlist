import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { createRunInJsFn, Wishlist } from 'react-native-wishlist';
import { AssetItem } from './AssetItem';
import { AssetListHeader } from './AssetListHeader';
import { AssetListSeparator } from './AssetListSeparator';
import assetsData from './assets';
import { Header } from './Header';
const tokens = assetsData.map((item) => ({
    ...item,
    type: 'asset',
    key: String(item.id),
}));
export const AssetListExample = () => {
    const [isEditing, setIsEditing] = useState(false);
    // Change this line to false show less by default
    const [isExpanded, setIsExpanded] = useState(false);
    const handleEdit = useCallback(() => {
        setIsEditing((v) => !v);
    }, []);
    const handleExpand = useCallback(() => {
        setIsExpanded((v) => !v);
    }, []);
    const [data, setData] = useState(tokens);
    const list = useMemo(() => {
        const arr = [
            {
                type: 'asset-list-header',
                isExpanded,
                key: 'header',
                isEditing,
                isSelected: false,
            },
        ].concat(data);
        const topItems = arr
            .slice(0, 6)
            .concat({
            type: 'asset-list-separator',
            key: 'separator',
            isEditing,
            isExpanded,
            isSelected: false,
        })
            .map((item) => ({
            ...item,
            isEditing,
            isExpanded,
        }));
        if (!isExpanded) {
            return topItems;
        }
        return topItems.concat(arr.slice(6, arr.length).map((item) => ({
            ...item,
            isEditing,
            isExpanded,
        })));
    }, [data, isExpanded, isEditing]);
    const handleExpandWorklet = createRunInJsFn(handleExpand);
    const handleEditWorklet = createRunInJsFn(handleEdit);
    const showItemAlert = createRunInJsFn((address) => {
        Alert.alert(address);
    });
    const toggleSelectedItem = createRunInJsFn((item) => {
        setData((items) => items.map((i) => 
        // @ts-expect-error
        i.id === item.id
            ? {
                ...i,
                isSelected: !item.isSelected,
            }
            : i));
    });
    const handleItemPress = (item) => {
        'worklet';
        if (item.isEditing) {
            toggleSelectedItem(item);
        }
        else {
            showItemAlert(item.address);
        }
    };
    return (React.createElement(View, { style: styles.container },
        React.createElement(Header, null),
        React.createElement(Wishlist.Component
        // @ts-expect-error: TODO: update the new useWishlistData api.
        , { 
            // @ts-expect-error: TODO: update the new useWishlistData api.
            initialData: () => list, style: styles.listContainer, initialIndex: 0 },
            React.createElement(Wishlist.Template, { type: "asset-list-header" },
                React.createElement(AssetListHeader, null)),
            React.createElement(Wishlist.Template, { type: "asset-list-separator" },
                React.createElement(AssetListSeparator, { onEdit: handleEditWorklet, onExpand: handleExpandWorklet })),
            React.createElement(Wishlist.Template, { type: "asset" },
                React.createElement(AssetItem, { onItemPress: handleItemPress })))));
};
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContainer: {
        flex: 1,
    },
});
