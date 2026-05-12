import React from 'react';
import { processColor, StyleSheet, View } from 'react-native';
import { useTemplateValue, Wishlist } from 'react-native-wishlist';
import { AssetIcon } from './AssetIcon';
import { ItemCheckbox } from './ItemCheckbox';
const green = processColor('#00D146');
const gray = processColor('#9DA0A8');
function AssetInfo() {
    const name = useTemplateValue((item) => item.name);
    const balance = useTemplateValue((item) => item.balance);
    const nativeBalance = useTemplateValue((item) => `${item.nativeBalance} ${item.symbol}`);
    const change = useTemplateValue((item) => item.change ? `${item.change}%` : '-');
    const changeColor = useTemplateValue((item) => (item.change && parseFloat(item.change) > 0
        ? green
        : gray));
    return (React.createElement(View, { style: styles.container },
        React.createElement(AssetIcon, null),
        React.createElement(View, { style: styles.content },
            React.createElement(View, { style: styles.row },
                React.createElement(Wishlist.Text, { style: styles.name }, name),
                React.createElement(Wishlist.Text, { style: styles.balance }, balance)),
            React.createElement(View, { style: [styles.row, styles.bottom] },
                React.createElement(Wishlist.Text, { style: styles.nativeBalance }, nativeBalance),
                React.createElement(Wishlist.Text, { style: [styles.change, { color: changeColor }] }, change)))));
}
export function AssetItem({ onItemPress }) {
    const isEditing = useTemplateValue((item) => item.isEditing);
    const paddingLeft = useTemplateValue((item) => item.isEditing ? 0 : 10);
    return (React.createElement(Wishlist.Pressable, { onPress: onItemPress },
        React.createElement(Wishlist.View, { style: [styles.rootContainer, { paddingLeft }] },
            React.createElement(Wishlist.IF, { condition: isEditing },
                React.createElement(ItemCheckbox, null)),
            React.createElement(AssetInfo, null))));
}
const styles = StyleSheet.create({
    name: {
        fontSize: 16,
    },
    balance: {
        textAlign: 'right',
        fontSize: 16,
    },
    nativeBalance: {
        fontSize: 14,
        color: '#9DA0A8',
    },
    change: {
        textAlign: 'right',
        fontSize: 14,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        flexDirection: 'row',
        marginRight: 19,
        overflow: 'visible',
        paddingLeft: 9,
    },
    bottom: {
        marginTop: 2,
    },
    icon: {
        borderRadius: 20,
        height: 40,
        width: 40,
    },
    content: {
        flex: 1,
        marginBottom: 1,
        marginLeft: 10,
    },
    rootContainer: {
        alignItems: 'center',
        flexDirection: 'row',
        overflow: 'visible',
    },
    row: {
        justifyContent: 'space-between',
        flexDirection: 'row',
    },
});
