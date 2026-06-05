// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Expo 기본 watchFolders 에 워크스페이스 루트를 추가 (기본값 보존)
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

// 2. 프로젝트 → 워크스페이스 루트 순으로 node_modules 해석
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. 웹에서 zustand 를 CJS 빌드로 강제.
// SDK 55 의 package-exports 가 웹에선 zustand 의 ESM 빌드(import.meta 사용)를 고르는데,
// Metro 웹 번들은 classic script 라 import.meta 가 SyntaxError → 앱 전체가 죽는다
// (데스크톱 검은 화면의 원인). CJS 빌드(index.js/middleware.js)엔 import.meta 가 없다.
const zustandRoot = path.dirname(require.resolve('zustand/package.json'));
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const sub = moduleName === 'zustand' ? 'index' : moduleName.slice('zustand/'.length);
    return { type: 'sourceFile', filePath: path.join(zustandRoot, `${sub}.js`) };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

// NativeWind: global.css 를 Tailwind 입력으로 연결
module.exports = withNativeWind(config, { input: './global.css' });
