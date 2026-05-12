const path = require('path');

module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must run BEFORE the worklets-core plugin so the callbacks already
      // carry the 'worklet' directive when worklets-core walks them — this
      // also covers helpers React Compiler hoists out of the call arguments.
      [
        path.join(__dirname, 'babel-plugin-wishlist-worklets.js'),
        { hooks: ['useTemplateValue'] },
      ],
      [
        'react-native-worklets-core/plugin',
        {
          functionsToWorkletize: [{ name: 'useTemplateValue', args: [0] }],
        },
      ],
    ],
  };
};
