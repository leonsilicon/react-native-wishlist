import React, { forwardRef, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { TemplateCallback, TemplateCallbackWorklet } from './EventHandler';
import { ForEachBase } from './Components/ForEachBase';
import InflatorRepository, {
  getUIInflatorRegistry,
} from './InflatorRepository';
import { CaseBase } from './Components/CaseBase';
import { useTemplateContext } from './TemplateContext';
import {
  createTemplateValue,
  isTemplateValue,
  TemplateValue,
  TemplateValueInternal,
} from './TemplateValue';
import { generateId } from './Utils';
import { useWishlistContext, useWishlistMode } from './WishlistContext';
import { useJsCurrentValue } from './JsTemplatesContext';
import { TemplateItem } from './TemplateItem';
import { ComponentPool } from './ComponentPool';

// This is based on types from @types/react-native createAnimatedComponent.

type Nullable = undefined | null;
type Primitive = string | number | boolean | symbol;
type Builtin = Function | Date | Error | RegExp;

interface WithTemplateArray<P> extends Array<WithTemplateValue<P>> {}
type WithTemplateObject<T> = {
  [K in keyof T]: WithTemplateValue<T[K]>;
};

type WithTemplateValue<T> = T extends Builtin | Nullable
  ? T
  : T extends Primitive
  ? T | TemplateValue<T>
  : T extends Array<infer P>
  ? WithTemplateArray<P>
  : T extends {}
  ? WithTemplateObject<T>
  : T;

type NonTemplateProps = 'key' | 'ref';

export type TemplateProps<T> = {
  [key in keyof T]: key extends NonTemplateProps
    ? T[key]
    : WithTemplateValue<T[key]>;
};

export interface TemplateComponent<T extends React.ComponentType<any>>
  extends React.FC<TemplateProps<React.ComponentPropsWithRef<T>>> {}

function setInObject(obj: any, path: string[], value: any) {
  'worklet';

  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    current[path[i]] = current[path[i]] ?? {};
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}

function traverseObject(
  obj: any,
  callback: (path: string[], value: any) => void,
) {
  const stack: { path: string[]; value: any }[] = [{ path: [], value: obj }];
  while (stack.length > 0) {
    const { path, value } = stack.pop()!;

    if (
      value &&
      typeof value === 'object' &&
      !isTemplateValue(value) &&
      !(value instanceof TemplateCallback) &&
      (path.length === 0 || path[path.length - 1] !== 'children')
    ) {
      Object.keys(value).forEach((key) => {
        stack.push({ path: [...path, key], value: value[key] });
      });
    } else {
      callback(path, value);
    }
  }
}

function convertToTemplateValue(value: unknown, path: string[]) {
  let curTemplateType = value;

  return {
    // TODO(janic): Need to call remove for template values created here.
    templateValue: createTemplateValue(() => {
      'worklet';
      return curTemplateType;
    }),
    targetPath: path,
  };
}

type CreateTemplateComponentOptions = {
  /**
   * Worklet that will be called when items are inflated.
   * This can be used to map props differently than the
   * default implementation.
   */
  addProps?: (
    templateItem: TemplateItem,
    props: any,
    inflatorId: string,
    pool: ComponentPool,
    rootValue: any,
  ) => void;
  /**
   * Additional non-template props that should be passed to
   * the inflator. Can use dot syntax to access nested props.
   */
  additionalTemplateProps?: string[];
};

function resolveJsxChildren(
  children: any,
  item: unknown,
  rootValue: unknown,
): any {
  if (children === null || children === undefined) return children;
  if (Array.isArray(children)) {
    return children.map((c) => resolveJsxChildren(c, item, rootValue));
  }
  if (isTemplateValue(children)) {
    return children.__resolveJs(item, rootValue);
  }
  // React elements (and primitives) pass through unchanged. Their own
  // descendants will resolve any template values when they render.
  return children;
}

function resolveTemplatePropsJs(
  props: any,
  item: unknown,
  rootValue: unknown,
): any {
  if (props === null || props === undefined) return props;
  if (isTemplateValue(props)) return props.__resolveJs(item, rootValue);
  if (props instanceof TemplateCallback) return undefined;
  if (typeof props !== 'object') return props;
  if (React.isValidElement(props)) return props;
  if (Array.isArray(props)) {
    return props.map((p) => resolveTemplatePropsJs(p, item, rootValue));
  }
  const out: any = {};
  for (const key in props) {
    out[key] = resolveTemplatePropsJs(props[key], item, rootValue);
  }
  return out;
}

export function createTemplateComponent<T extends React.ComponentType<any>>(
  Component: T,
  { addProps, additionalTemplateProps }: CreateTemplateComponentOptions = {},
): TemplateComponent<T> {
  const parsedAdditionalTemplateProps =
    additionalTemplateProps?.map((prop) => prop.split('.')) ?? [];

  const WishListComponent = forwardRef<any, any>((rawProps, ref) => {
    const mode = useWishlistMode();
    const jsCurrent = useJsCurrentValue();
    if (mode === 'javascript') {
      // In JS mode the same JSX is rendered as plain React per visible item.
      // Resolve TemplateValues at render time by walking props and calling
      // each TemplateValue's mapper with the current item from React context.
      // Drop TemplateCallbacks — those are wired by the wrapping primitives
      // (Pressable, etc.).
      const item = jsCurrent?.item;
      const rootValue = jsCurrent?.rootValue;
      const { style, children, ...rest } = rawProps;
      const resolvedRest = resolveTemplatePropsJs(rest, item, rootValue);
      const resolvedStyle = resolveTemplatePropsJs(style, item, rootValue);
      const resolvedChildren = resolveJsxChildren(children, item, rootValue);
      return (
        <Component {...(resolvedRest as any)} style={resolvedStyle} ref={ref}>
          {resolvedChildren}
        </Component>
      );
    }

    const { style, ...props } = rawProps;
    const { inflatorId } = useWishlistContext();
    const { templateType } = useTemplateContext();

    const nativeId = useMemo(generateId, []);

    const otherPropsMemoized = useMemo(() => {
      const resolvedStyle = StyleSheet.flatten(style);

      const templateValues: {
        templateValue: TemplateValueInternal<any>;
        targetPath: string[];
      }[] = [];

      const templateCallbacks: {
        worklet: TemplateCallbackWorklet;
        eventName: string;
      }[] = [];

      const additionalProps: { targetPath: string[]; value: any }[] = [];

      const otherProps = {};
      traverseObject({ ...props, style: resolvedStyle }, (path, value) => {
        const applyHacks = () => {
          // Text component needs to receive a string child to work properly.
          // @ts-expect-error TODO: fix this.
          if (path[0] === 'children' && Component === Text) {
            setInObject(otherProps, path, ' ');
          }
        };

        if (isTemplateValue(value)) {
          templateValues.push({ templateValue: value, targetPath: path });

          applyHacks();
        } else if (value instanceof TemplateCallback) {
          templateCallbacks.push({
            worklet: value.worklet,
            // Callbacks should never be in objects.
            eventName: value.eventName ?? path[0].replace(/^on/, 'top'),
          });
          // Events have a boolean prop associated to know whether the
          // function is set or not, so we still want to pass the prop.
          setInObject(otherProps, path, () => {});
        } else {
          // @ts-expect-error TODO: fix this.
          if (Component === ForEachBase && path[0] === 'template') {
            templateValues.push(convertToTemplateValue(value, path));
          }

          if (
            // @ts-expect-error TODO: fix this.
            Component === CaseBase &&
            path[0] === 'value' &&
            !isTemplateValue(value)
          ) {
            templateValues.push(convertToTemplateValue(value, path));
          }

          if (
            // @ts-expect-error TODO: fix this.
            Component === Text &&
            path[0] === 'children' &&
            !isTemplateValue(value)
          ) {
            templateValues.push(convertToTemplateValue(value, path));
          }

          parsedAdditionalTemplateProps.forEach((additionalPath) => {
            if (
              additionalPath.length === path.length &&
              additionalPath.every((p, i) => p === path[i])
            ) {
              additionalProps.push({ targetPath: path, value });
            }
          });

          setInObject(otherProps, path, value);
        }
      });
      InflatorRepository.registerMapping(
        inflatorId,
        nativeId,
        templateType,
        (value, templateItem, pool, rootValue) => {
          'worklet';

          const propsToSet: any = {};
          additionalProps.forEach(({ targetPath, value: v }) => {
            setInObject(propsToSet, targetPath, v);
          });
          templateValues.forEach(({ templateValue, targetPath }) => {
            setInObject(propsToSet, targetPath, templateValue.value());
          });

          templateCallbacks.forEach(({ eventName, worklet }) => {
            templateItem.setCallback(eventName, (ev) => {
              getUIInflatorRegistry().withCurrentValues(
                value,
                rootValue,
                () => {
                  worklet(ev, value, rootValue);
                },
              );
            });
          });

          // Styles need to be passed as props.
          const { style: styleForProps, ...otherPropsToSet } = propsToSet;
          const finalPropsToSet = { ...otherPropsToSet, ...styleForProps };
          if (addProps) {
            addProps(
              templateItem,
              finalPropsToSet,
              inflatorId,
              pool,
              rootValue,
            );
          } else {
            templateItem.addProps(finalPropsToSet);
          }
        },
      );
      return otherProps;
      // TODO: This will change on every render, if we want this memo to work properly we need
      // to shallow compare the props object.
    }, [inflatorId, nativeId, props, style, templateType]);

    // @ts-expect-error: this is ok.
    return <Component {...otherPropsMemoized} ref={ref} nativeID={nativeId} />;
  }) as unknown as TemplateComponent<T>;

  WishListComponent.displayName = `WishList(${Component.displayName})`;

  return WishListComponent;
}
