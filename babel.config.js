module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-worklets/plugin',
        {
          globals: ['_log', '_chronoNow'],
          functionsToWorkletize: [{ name: 'useTemplateValue', args: [0] }],
        },
      ],
    ],
  };
};
