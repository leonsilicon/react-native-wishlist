const path = require('path');
const pak = require('../package.json');

module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must run BEFORE the worklets plugin so the callbacks already carry the
      // 'worklet' directive when worklets walks them.
      [
        path.join(__dirname, '..', 'babel-plugin-wishlist-worklets.js'),
        { hooks: ['useTemplateValue'] },
      ],
      [
        'react-native-worklets/plugin',
        {
          globals: ['_log', '_chronoNow'],
        },
      ],
      [
        'module-resolver',
        {
          extensions: ['.tsx', '.ts', '.js', '.json'],
          alias: {
            [pak.name]: path.join(__dirname, '..', pak.source),
          },
        },
      ],
    ],
  };
};
