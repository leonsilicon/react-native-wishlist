import type { TemplateValueUIState } from './TemplateValue';

type JsInflatorRegistry = {
  getTemplateValueState: (id: string) => TemplateValueUIState | undefined;
  setTemplateValueState: (id: string, state: TemplateValueUIState) => void;
  deleteTemplateValueState: (id: string) => void;
  getCurrentValue: () => unknown;
  getCurrentRootValue: () => unknown;
  setCurrentValues: (
    value: unknown,
    rootValue: unknown,
  ) => { previousValue: unknown; previousRootValue: unknown };
  restoreCurrentValues: (snapshot: {
    previousValue: unknown;
    previousRootValue: unknown;
  }) => void;
  // Marks all template-value caches dirty so the next `value()` call
  // re-runs its mapper. Use whenever the current item/root has just
  // changed for the duration of a synchronous descendant render.
  invalidate: () => void;
};

const templateValueStates = new Map<string, TemplateValueUIState>();
let currentValue: unknown;
let currentRootValue: unknown;

const registry: JsInflatorRegistry = {
  getTemplateValueState: (id) => templateValueStates.get(id),
  setTemplateValueState: (id, state) => {
    templateValueStates.set(id, state);
  },
  deleteTemplateValueState: (id) => {
    templateValueStates.delete(id);
  },
  getCurrentValue: () => currentValue,
  getCurrentRootValue: () => currentRootValue,
  setCurrentValues: (value, rootValue) => {
    const snap = {
      previousValue: currentValue,
      previousRootValue: currentRootValue,
    };
    currentValue = value;
    currentRootValue = rootValue;
    // Invalidate cached template-value states so descendants re-evaluate
    // against the new item.
    for (const state of templateValueStates.values()) {
      state.dirty = true;
    }
    return snap;
  },
  restoreCurrentValues: (snapshot) => {
    currentValue = snapshot.previousValue;
    currentRootValue = snapshot.previousRootValue;
    for (const state of templateValueStates.values()) {
      state.dirty = true;
    }
  },
  invalidate: () => {
    for (const state of templateValueStates.values()) {
      state.dirty = true;
    }
  },
};

export function getJsInflatorRegistry(): JsInflatorRegistry {
  return registry;
}
