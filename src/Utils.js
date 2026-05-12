import { useRef } from 'react';
let idGenerator = 0;
export function generateId() {
    return `id_${idGenerator++}`;
}
export function useGeneratedId() {
    const ref = useRef(null);
    if (ref.current === null) {
        ref.current = generateId();
    }
    return ref.current;
}
