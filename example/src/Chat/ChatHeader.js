import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
const avatar = require('./assets/margelo_logo.png');
export function ChatHeader({ isLoading, onRefreshPress }) {
    return (React.createElement(View, { style: styles.container },
        React.createElement(View, { style: styles.left },
            React.createElement(View, { style: [styles.avatarContainer, isLoading && styles.gray] }, !isLoading && (React.createElement(Image, { style: styles.avatar, resizeMode: "contain", source: avatar })))),
        React.createElement(View, { style: styles.center }, !isLoading && React.createElement(Text, { style: styles.title }, "Margelo.com")),
        React.createElement(View, { style: styles.right }, onRefreshPress != null && (React.createElement(TouchableOpacity, { onPress: onRefreshPress, style: styles.iconButton },
            React.createElement(Image, { source: require('./assets/refresh.png'), style: styles.icon }))))));
}
const styles = StyleSheet.create({
    container: {
        height: 108,
        paddingTop: 58,
        paddingHorizontal: 19,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    avatar: {
        width: 20,
        height: 20,
    },
    avatarContainer: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
    },
    gray: {
        backgroundColor: '#9DA0A8',
    },
    center: {
        flex: 1,
        alignItems: 'center',
    },
    left: {
        width: 60,
    },
    right: {
        width: 60,
        alignItems: 'flex-end',
    },
    title: {
        fontSize: 18,
        fontWeight: '500',
    },
    iconButton: {
        padding: 8,
    },
    icon: {
        width: 24,
        height: 24,
    },
});
