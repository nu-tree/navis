// navis-cli 번들러 — esbuild 로 cli.tsx + (navis 두뇌의 사용 코드)를 단일 파일로 인라인한다.
// 두뇌는 tsconfig paths("navis/*" → ../navis/src/*)로 소스에서 직접 가져오고, tree-shaking
// 으로 CLI 가 안 쓰는 서버 코드(cron/google/sharp 등)는 번들에서 제외된다. 그래서 결과물은
// 자기완결이며 가볍다(google/cron/sharp 없음).
//
// react/ink 는 반드시 "번들에 인라인" 한다 — external 로 두면 ink 가 자기 node_modules 의
// react 를, 번들이 또 다른 react 를 잡아 "여러 copy of React" → Invalid hook call 이 난다.
// 전부 한 번들 안에 넣으면 react 인스턴스가 하나라 hooks 가 정상 동작한다.
//
// 단 @anthropic-ai/claude-agent-sdk 는 external — 자체적으로 claude 서브프로세스를 스폰하는
// 런타임이라 번들에 넣으면 깨진다. 이 하나만 런타임 node_modules 에서 로드.
import { build } from "esbuild";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// 워크스페이스에 react 가 둘(루트 19.2.0, ink 내부 19.2.6) 깔려 있어, alias 로 모든 react
// import(우리 코드 + ink 내부 포함)를 하나의 인스턴스로 강제한다. 안 그러면 번들에 react 가
// 두 copy 들어가 "Invalid hook call" 이 난다.
const reactAlias = {
  react: require.resolve("react"),
  "react/jsx-runtime": require.resolve("react/jsx-runtime"),
  "react/jsx-dev-runtime": require.resolve("react/jsx-dev-runtime"),
};

await build({
  entryPoints: ["src/cli.tsx"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cli.js",
  alias: reactAlias,
  // react 를 production 모드로 번들 — dev 경고 제거 + 번들 슬림.
  define: { "process.env.NODE_ENV": '"production"' },
  // ESM 번들 맨 위에 (1) shebang, (2) require 심을 넣는다.
  //  - shebang: cli.tsx 에선 제거하고 여기서 1줄째로 보장(중복 방지).
  //  - require 심: 번들된 일부 CJS 의존성이 require("assert") 같은 동적 require 를 쓰는데,
  //    ESM 출력엔 require 가 없어 createRequire 로 만들어 줘야 "Dynamic require ... not supported" 가 안 난다.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'module';\nconst require = __cr(import.meta.url);",
  },
  external: ["@anthropic-ai/claude-agent-sdk"],
});

console.log("navis-cli 번들 완료 → dist/cli.js");
