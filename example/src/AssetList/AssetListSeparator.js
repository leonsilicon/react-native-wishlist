import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { useTemplateValue, Wishlist } from 'react-native-wishlist';
export function AssetListSeparator({ onExpand, onEdit, }) {
    const isEditing = useTemplateValue((item) => item.isEditing);
    const expandButtonText = useTemplateValue((item) => item.isExpanded ? 'Less ↑' : 'More ↓');
    const isExpanded = useTemplateValue((item) => item.isExpanded);
    const editButtonText = useTemplateValue((item) => item.isEditing ? 'Done' : 'Edit');
    const onPin = () => {
        'worklet';
    };
    const onHide = () => {
        'worklet';
    };
    return (React.createElement(View, { style: styles.container },
        React.createElement(Wishlist.Switch, { value: isEditing },
            React.createElement(Wishlist.Case, { value: true },
                React.createElement(View, { style: styles.buttonGroup },
                    React.createElement(Button, { disabled: true, onPress: onPin, text: "Pin", active: false }),
                    React.createElement(View, { style: styles.margin }),
                    React.createElement(Button, { disabled: true, onPress: onHide, text: "Hide", active: false }))),
            React.createElement(Wishlist.Case, { value: false },
                React.createElement(Button, { active: false, text: expandButtonText, onPress: onExpand }))),
        React.createElement(Wishlist.IF, { condition: isExpanded },
            React.createElement(Button, { text: editButtonText, onPress: onEdit, active: false }))));
}
const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 19,
        paddingVertical: 5,
        height: 50,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    name: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: 0.4,
        textAlign: 'left',
    },
    balance: {
        fontSize: 24,
        fontWeight: '600',
        letterSpacing: 0.4,
        textAlign: 'right',
    },
    buttonGroup: {
        flexDirection: 'row',
    },
    margin: {
        width: 8,
    },
});
