import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { emoticons } from './Data';
export function ReactionPicker({ onPickReaction }) {
    return (React.createElement(View, { style: styles.backdrop },
        React.createElement(View, { style: styles.container }, emoticons.map((emoji, index) => (React.createElement(TouchableOpacity, { onPress: () => onPickReaction(emoji), key: String(index) },
            React.createElement(Text, { style: styles.emoji }, emoji)))))));
}
const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        flexDirection: 'row',
        padding: 24,
        backgroundColor: 'white',
        borderRadius: 24,
    },
    emoji: {
        fontSize: 38,
        paddingHorizontal: 8,
    },
});
