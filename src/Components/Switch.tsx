import React from 'react';
import { View, ViewStyle } from 'react-native';
import { createTemplateComponent } from '../createTemplateComponent';
import { useJsCurrentValue } from '../JsTemplatesContext';
import { isTemplateValue, type TemplateValue } from '../TemplateValue';
import { useWishlistMode } from '../WishlistContext';
import { CaseBase } from './CaseBase';

export { CaseBase };

const SwitchTemplateComponent = createTemplateComponent(View);

type SwitchProps = {
  value: TemplateValue<unknown>;
  children: React.ReactElement<typeof Case>[];
  style?: ViewStyle;
};

export function Switch(props: SwitchProps) {
  const mode = useWishlistMode();
  const current = useJsCurrentValue();
  if (mode === 'javascript') {
    const resolvedSwitch = isTemplateValue(props.value)
      ? props.value.__resolveJs(current?.item, current?.rootValue)
      : (props.value as unknown);
    let matched: React.ReactElement | null = null;
    React.Children.forEach(props.children, (child) => {
      if (matched) return;
      const caseValue = (child as any).props?.value;
      const resolvedCase = isTemplateValue(caseValue)
        ? caseValue.__resolveJs(current?.item, current?.rootValue)
        : caseValue;
      if (resolvedCase === resolvedSwitch) {
        matched = child as React.ReactElement;
      }
    });
    return <View style={props.style}>{matched}</View>;
  }

  const children = React.Children.map(props.children, (item) =>
    React.cloneElement(item, {
      ...item.props,
      // @ts-expect-error this is hidden property
      switchValue: props.value,
    }),
  );

  return <SwitchTemplateComponent {...props} children={children} />;
}

const CaseTemplateComponent = createTemplateComponent(CaseBase, {
  addProps: (item, props) => {
    'worklet';

    if (props.switchValue === props.value) {
      item.addProps({ display: 'flex' });
    } else {
      item.addProps({ display: 'none' });
    }
  },
});

type CaseProps = React.PropsWithChildren<{
  value: TemplateValue<unknown> | string | boolean | number;
  style?: ViewStyle;
}>;

export function Case(props: CaseProps) {
  const mode = useWishlistMode();
  if (mode === 'javascript') {
    return <View style={props.style}>{props.children}</View>;
  }
  return <CaseTemplateComponent {...props} />;
}
