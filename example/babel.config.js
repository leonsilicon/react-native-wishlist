module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-worklets-core/plugin',
        {
          functionsToWorkletize: [{ name: 'useTemplateValue', args: [0] }],
        },
      ],
      [
        'react-native-worklets/plugin',
      ],
    ],
  };
};
