import { getUIInflatorRegistry } from './InflatorRepository';
export function renderTemplate(template, value, rootValue, inflatorId, pool) {
    'worklet';
    const item = pool.getComponent(template);
    return getUIInflatorRegistry().useMappings(item, value, template, inflatorId, pool, rootValue);
}
