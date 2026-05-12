export function wrapComponentPool(pool) {
    'worklet';
    return {
        getComponent: pool.getComponent,
        createNode(type) {
            switch (type) {
                case 'Paragraph':
                    return pool.getComponent('__paragraphComponent').Paragraph;
                case 'Text':
                    return pool.getComponent('__textComponent').Paragraph.Text;
                case 'RawText':
                    return pool.getComponent('__paragraphComponent').Paragraph.RawText;
                case 'View':
                    return pool.getComponent('__viewComponent');
                default:
                    throw new Error(`Unknown node type ${type}`);
            }
        },
    };
}
