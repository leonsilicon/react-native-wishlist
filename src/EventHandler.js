import { useMemo } from 'react';
import { createRunInWishlistFn } from './WishlistJsRuntime';
let done = false;
const maybeInit = () => {
    if (!done) {
        done = true;
        createRunInWishlistFn(() => {
            'worklet';
            global.handlers = {};
            global.handleEvent = (type, tag, event) => {
                // Events are prefixed with top sometimes.
                const key = tag.toString() + type.replace(/^topOn/, 'on');
                const callback = global.handlers[key];
                if (callback) {
                    callback(event);
                }
            };
        })();
    }
};
export class TemplateCallback {
    worklet;
    eventName;
    constructor(worklet, eventName) {
        this.worklet = worklet;
        this.eventName = eventName;
    }
}
export function useTemplateCallback(worklet, eventName) {
    return useMemo(() => {
        return new TemplateCallback(worklet, eventName);
    }, [worklet, eventName]);
}
export function initEventHandler() {
    maybeInit();
}
