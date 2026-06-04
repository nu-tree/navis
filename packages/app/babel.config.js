module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource: nativewind 가 있어야 className 이 동작한다
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
