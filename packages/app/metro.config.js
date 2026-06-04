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

// NativeWind: global.css 를 Tailwind 입력으로 연결
module.exports = withNativeWind(config, { input: './global.css' });
