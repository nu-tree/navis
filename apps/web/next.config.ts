import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 워크스페이스 패키지를 TS 소스 그대로 가져온다(둘 다 private, 빌드 산출물 없음).
  // 별도 tsc 빌드 단계를 두지 않아 빌드 순서 문제가 생기지 않는다.
  transpilePackages: ["navis", "namory"],

  // Claude Agent SDK 는 번들러가 정적 분석할 수 없는 방식으로 자기 실행파일을 찾아
  // 서브프로세스로 띄운다. 번들에 끌어들이지 말고 런타임에 require 하게 둔다.
  // sharp 는 네이티브 바이너리라 같은 이유로 제외.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "sharp"],

  webpack(config) {
    // navis/namory 소스는 NodeNext 규약(`./foo.js` 가 foo.ts 를 가리킴)으로 쓰여 있다.
    // Node 는 이걸 그대로 해석하지만 webpack 은 안 하므로 확장자 별칭을 알려준다.
    // 이 규약을 버리고 확장자 없는 import 로 바꾸는 방법도 있지만, 그러면 두 패키지를
    // Node 로 직접 실행(로컬 스크립트·마이그레이션)할 수 없게 된다.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },

  turbopack: {
    resolveAlias: {},
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
};

export default nextConfig;
