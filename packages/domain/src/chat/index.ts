// 대화 턴 실행 — Agent SDK 를 돌려 응답을 스트리밍하고 기억 도구를 물린다.
//
// 이관 예정 (from packages/navis/src/claude/):
//   ask/*, allowed-tools.ts, images.ts, mcp.ts, nudge.ts,
//   query-options.ts, tool-status.ts, types.ts
//
// 이관 시 반드시 반영할 것:
//  - 기억을 in-process MCP 로 붙인다(createSdkMcpServer). 예전엔 HTTP MCP 라
//    매 턴 자기 자신에게 왕복했다. 이게 첫 토큰 지연의 가장 큰 원인이었다.
//  - ChatEnv/server-env/prefetch 추상은 가져오지 않는다. 부수 도구가 전부
//    사라져 주입할 게 없다 — MCP 서버는 기억 하나뿐이다.
//  - 파일/셸 도구(Read/Write/Edit/Bash) 자동승인을 가져오지 않는다. 서버에
//    소스 트리가 없어 얻는 것이 없고, API 토큰이 새면 임의 명령 실행이 된다.
//  - 큐레이터(사후 저장 판단)는 가져오지 않는다. save 너지로 충분하고 매 턴
//    지연에 직접 더해진다.
//  - 중지는 프로세스 로컬 Map<turnId, AbortController> 로 충분하다(상주 서버).

export {};
