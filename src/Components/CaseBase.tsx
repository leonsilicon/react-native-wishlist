import React, { forwardRef } from 'react';
import { View } from 'react-native';

export const CaseBase = forwardRef<any, any>((props, ref) => {
  return <View {...props} ref={ref} />;
});
