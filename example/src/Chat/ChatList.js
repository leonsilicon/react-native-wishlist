import React from 'react';
import { Wishlist, } from 'react-native-wishlist';
import { ChatItemView } from './ChatItem';
import { LoadingView } from './LoadingView';
export const ChatListView = React.memo(React.forwardRef(({ data, intialIndex, onAddReaction, onStartReached, onEndReached, style, }, ref) => {
    return (React.createElement(Wishlist.Component, { style: style, initialIndex: intialIndex, data: data, ref: ref, onStartReached: onStartReached, onEndReached: onEndReached },
        React.createElement(Wishlist.Template, { type: "me" },
            React.createElement(ChatItemView, { onAddReaction: onAddReaction, type: "me" })),
        React.createElement(Wishlist.Template, { type: "other" },
            React.createElement(ChatItemView, { onAddReaction: onAddReaction, type: "other" })),
        React.createElement(Wishlist.Template, { type: "loading" },
            React.createElement(LoadingView, null))));
}));
