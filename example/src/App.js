import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Chat from './Chat/ChatExample';
// import { AssetListExample } from './AssetList/AssetListExample';
export function App() {
    return (React.createElement(GestureHandlerRootView, { style: { flex: 1 } },
        React.createElement(Chat, null)));
}
