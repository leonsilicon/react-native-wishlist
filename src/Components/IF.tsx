import React from 'react';
import { View } from 'react-native';
import { createTemplateComponent } from '../createTemplateComponent';
import { useJsCurrentValue } from '../JsTemplatesContext';
import { isTemplateValue } from '../TemplateValue';
import { useWishlistMode } from '../WishlistContext';

const IFTemplateComponent = createTemplateComponent(View, {
  addProps: (item, props) => {
    'worklet';

    if (props.condition) {
      item.addProps({ display: 'flex' });
    } else {
      item.addProps({ display: 'none' });
    }
  },
});

// TODO(terry): Fix IF props type
export function IF(props: any) {
  const mode = useWishlistMode();
  const current = useJsCurrentValue();
  if (mode === 'javascript') {
    const { condition, children, ...rest } = props;
    const resolved = isTemplateValue(condition)
      ? condition.__resolveJs(current?.item, current?.rootValue)
      : condition;
    if (!resolved) return null;
    return <View {...rest}>{children}</View>;
  }
  return <IFTemplateComponent {...props} />;
}
