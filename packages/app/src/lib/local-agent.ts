// 데스크톱(Electron) 로컬 에이전트 브리지 래퍼. preload.cjs 가 window.navisLocal 을
// 주입한 환경(데스크톱)에서만 존재한다. 모바일/웹(비-Electron)에선 undefined.

export type LocalAgentConfig = {
  enabled: boolean;
  workdir: string;
  allowWrite: boolean;
  hasToken: boolean;
  // 작업 폴더에서 감지한 namory 프로젝트명(코드 바 표시 + 기억 태깅).
  project?: string;
};

// namory MCP 좌표 — 코드 세션이 기억 recall/save 를 직접 붙일 때 전달.
export type NamoryMcp = { url: string; token: string };

export type LocalAgentConfigPatch = Partial<{
  enabled: boolean;
  workdir: string;
  allowWrite: boolean;
  token: string;
}>;

type LocalAgentApi = {
  isDesktop: boolean;
  getConfig: () => Promise<LocalAgentConfig>;
  setConfig: (patch: LocalAgentConfigPatch) => Promise<{ ok: boolean }>;
  run: (
    prompt: string,
    // resume: 이어갈 SDK 세션 id(코드 세션 멀티턴). namory: 기억 MCP 좌표(있으면 연결).
    // onDelta 로 본문/도구 사용을 스트리밍.
    opts?: { onDelta?: (text: string) => void; resume?: string; namory?: NamoryMcp },
  ) => Promise<{ text?: string; error?: string; sessionId?: string }>;
  // 생성 중단(정지 버튼). 진행 중인 모든 run 을 끊는다.
  stop: () => void;
};

function getApi(): LocalAgentApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as unknown as { navisLocal?: LocalAgentApi }).navisLocal;
  return api && api.isDesktop ? api : undefined;
}

export const localAgent = getApi();
export const hasLocalAgent = !!localAgent;
