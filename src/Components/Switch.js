import React, { forwardRef } from 'react';
import { View } from 'react-native';
import { createTemplateComponent } from '../createTemplateComponent';
const SwitchTemplateComponent = createTemplateComponent(View);
export function Switch(props) {
    const children = React.Children.map(props.children, (item) => React.cloneElement(item, {
        ...item.props,
        // @ts-expect-error this is hidden property
        switchValue: props.value,
    }));
    return React.createElement(SwitchTemplateComponent, { ...props, children: children });
}
export const CaseBase = forwardRef((props, ref) => {
    return React.createElement(View, { ...props, ref: ref });
});
const CaseTemplateComponent = createTemplateComponent(CaseBase, {
    addProps: (item, props) => {
        'worklet';
        if (props.switchValue === props.value) {
            item.addProps({ display: 'flex' });
        }
        else {
            item.addProps({ display: 'none' });
        }
    },
});
export function Case(props) {
    return React.createElement(CaseTemplateComponent, { ...props });
}
