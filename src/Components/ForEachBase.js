import React, { forwardRef } from 'react';
import { View } from 'react-native';
// This needs to be split to avoid circular dependency.
export const ForEachBase = forwardRef((props, ref) => {
    return React.createElement(View, { ...props, ref: ref });
});
