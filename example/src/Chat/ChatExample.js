import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createRunInJsFn, useWishlistData, } from 'react-native-wishlist';
import { ChatHeader } from './ChatHeader';
import { ChatListView } from './ChatList';
import { fetchData, getSendedMessage } from './Data';
import { MessageInput } from './MessageInput';
import { ReactionPicker } from './ReactionPicker';
const INITIAL_ITEMS_COUNT = 20;
const LOADING_TIME = 2000;
const START_LOADING_ITEM = { type: 'loading', key: 'start-loading' };
const END_LOADING_ITEM = { type: 'loading', key: 'end-loading' };
export default function App() {
    const data = useWishlistData(() => []);
    const [loading, setLoading] = useState(true);
    const loadingStartRef = useRef(false);
    const loadingEndRef = useRef(false);
    const listRef = useRef(null);
    const handleSend = async (text) => {
        const newItem = getSendedMessage(text);
        const index = await data.update((dataCopy) => {
            'worklet';
            dataCopy.push(newItem);
            return dataCopy.length - 1;
        });
        listRef.current?.scrollToItem(index);
    };
    // Load data
    useEffect(() => {
        setTimeout(() => {
            const initialItems = fetchData(INITIAL_ITEMS_COUNT);
            data.update((dataCopy) => {
                'worklet';
                dataCopy.setItems(initialItems);
            });
            setLoading(false);
        }, LOADING_TIME);
    }, [data]);
    const [activeMessageIdForReaction, setActiveMessageIdForReaction] = useState(null);
    const showAddReactionModal = useCallback((item) => {
        setActiveMessageIdForReaction(item.key);
    }, []);
    const onAddReaction = createRunInJsFn(showAddReactionModal);
    const onPickReaction = (emoji) => {
        data.update((dataCopy) => {
            'worklet';
            const oldValue = dataCopy.getItem(activeMessageIdForReaction);
            oldValue.reactions.push({ emoji, key: Math.random().toString() });
            dataCopy.setItem(activeMessageIdForReaction, oldValue);
        });
        setActiveMessageIdForReaction(null);
    };
    const onStartReached = () => {
        if (loadingStartRef.current) {
            return;
        }
        loadingStartRef.current = true;
        data.update((dataCopy) => {
            'worklet';
            dataCopy.unshift(START_LOADING_ITEM);
        });
        setTimeout(async () => {
            const newItems = fetchData(INITIAL_ITEMS_COUNT);
            await data.update((dataCopy) => {
                'worklet';
                dataCopy.removeItem(START_LOADING_ITEM.key);
                for (const item of newItems) {
                    dataCopy.unshift(item);
                }
            });
            loadingStartRef.current = false;
        }, LOADING_TIME);
    };
    const onEndReached = () => {
        if (loadingEndRef.current) {
            return;
        }
        loadingEndRef.current = true;
        data.update((dataCopy) => {
            'worklet';
            dataCopy.push(END_LOADING_ITEM);
        });
        setTimeout(async () => {
            const newItems = fetchData(INITIAL_ITEMS_COUNT);
            await data.update((dataCopy) => {
                'worklet';
                dataCopy.removeItem(END_LOADING_ITEM.key);
                for (const item of newItems) {
                    dataCopy.push(item);
                }
            });
            loadingEndRef.current = false;
        }, LOADING_TIME);
    };
    const onRefreshPress = () => {
        const newItems = fetchData(INITIAL_ITEMS_COUNT);
        data.update((dataCopy) => {
            'worklet';
            dataCopy.setItems(newItems);
        });
    };
    if (loading) {
        return (React.createElement(React.Fragment, null,
            React.createElement(ChatHeader, { isLoading: true }),
            React.createElement(View, { style: [styles.container, styles.center] },
                React.createElement(ActivityIndicator, { size: "small" }))));
    }
    return (React.createElement(React.Fragment, null,
        React.createElement(View, { style: styles.container },
            React.createElement(ChatHeader, { isLoading: false, onRefreshPress: onRefreshPress }),
            React.createElement(ChatListView, { style: styles.list, data: data, intialIndex: INITIAL_ITEMS_COUNT - 1, onAddReaction: onAddReaction, onStartReached: onStartReached, onEndReached: onEndReached, ref: listRef }),
            React.createElement(MessageInput, { onSend: handleSend })),
        activeMessageIdForReaction && (React.createElement(ReactionPicker, { onPickReaction: onPickReaction }))));
}
const styles = StyleSheet.create({
    container: { flex: 1 },
    list: { flex: 1 },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});
