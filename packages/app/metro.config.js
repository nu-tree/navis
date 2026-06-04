// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. 모노레포 전체를 watch (워크스페이스 내부 패키지 변경 감지)
config.watchFolders = [workspaceRoot];

// 2. 프로젝트 → 워크스페이스 루트 순으로 node_modules 해석
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// NativeWind: global.css 를 Tailwind 입력으로 연결
module.exports = withNativeWind(config, { input: './global.css' });
