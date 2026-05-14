import { createContext, useContext } from 'react';
import type React from 'react';

export type JsTemplatesContextValue = {
  templates: { [type: string]: React.ReactElement };
  // Called by `Wishlist.Template` in JS mode when it encounters a nested
  // template declaration so it becomes resolvable from `Wishlist.ForEach`.
  registerNested: (type: string, element: React.ReactElement) => void;
};

export const JsTemplatesContext =
  createContext<JsTemplatesContextValue | null>(null);

export function useJsTemplates(): JsTemplatesContextValue | null {
  return useContext(JsTemplatesContext);
}

export type JsCurrentValue = {
  item: unknown;
  rootValue: unknown;
};

export const JsCurrentValueContext = createContext<JsCurrentValue | null>(null);

export function useJsCurrentValue(): JsCurrentValue | null {
  return useContext(JsCurrentValueContext);
}
