import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
export function AssetListHeader() {
    return (React.createElement(View, { style: styles.container },
        React.createElement(Text, { style: styles.name }, "vitalik.eth"),
        React.createElement(Text, { style: styles.balance }, "$2,773,494.65")));
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
});
