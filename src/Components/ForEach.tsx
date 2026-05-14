import React from 'react';
import { View } from 'react-native';
import { renderTemplate } from '../renderTemplate';
import { createTemplateComponent } from '../createTemplateComponent';
import {
  JsCurrentValueContext,
  useJsCurrentValue,
  useJsTemplates,
} from '../JsTemplatesContext';
import { isTemplateValue } from '../TemplateValue';
import { useWishlistMode } from '../WishlistContext';
import { ForEachBase } from './ForEachBase';

const NativeForEach = createTemplateComponent(ForEachBase, {
  addProps: (item, props, inflatorId, pool, rootValue) => {
    'worklet';

    const subItems: unknown[] = props.items;
    const items = subItems.map((subItem) => {
      return renderTemplate(
        props.template,
        subItem,
        rootValue,
        inflatorId,
        pool,
      );
    });

    item.setChildren(items);
  },
});

export function ForEach(props: any) {
  const mode = useWishlistMode();
  const templates = useJsTemplates();
  const current = useJsCurrentValue();
  if (mode === 'javascript') {
    const rawItems = props.items;
    const items: unknown[] = isTemplateValue(rawItems)
      ? rawItems.__resolveJs(current?.item, current?.rootValue)
      : rawItems ?? [];
    const templateName: string = props.template;
    const templateEl = templates?.templates[templateName];
    if (!templateEl) {
      return <View style={props.style} />;
    }
    return (
      <View style={props.style}>
        {items.map((subItem, index) => (
          <JsCurrentValueContext.Provider
            key={(subItem as any)?.key ?? index}
            value={{
              item: subItem,
              rootValue: current?.rootValue ?? subItem,
            }}
          >
            {templateEl}
          </JsCurrentValueContext.Provider>
        ))}
      </View>
    );
  }
  return <NativeForEach {...props} />;
}
