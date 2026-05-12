import { View, ActivityIndicator, StyleSheet } from 'react-native';
import React from 'react';
export function LoadingView() {
    return (React.createElement(View, { style: styles.container },
        React.createElement(ActivityIndicator, null)));
}
const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
});
