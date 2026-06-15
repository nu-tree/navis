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
    // workdir: 이 세션의 작업 폴더(세션별). onDelta 로 본문/도구 사용을 스트리밍.
    opts?: {
      onDelta?: (text: string) => void;
      // 도구 사용 한 줄(파일 읽기/수정/터미널 등) — 접이식 '작업 과정' 블록에 쌓인다.
      onTool?: (label: string) => void;
      // 생각 과정(확장 사고) 델타 — 접이식 '생각 과정' 블록에 누적.
      onThinking?: (delta: string) => void;
      resume?: string;
      workdir?: string;
      namory?: NamoryMcp;
      // 첨부 이미지(data URL 배열) — 코드 세션 비전 입력.
      images?: string[];
    },
  ) => Promise<{ text?: string; error?: string; sessionId?: string }>;
  // 코드 세션 작업 폴더 선택(네이티브 다이얼로그). 취소하면 null.
  pickFolder: () => Promise<{ workdir: string; project?: string } | null>;
  // 작업 폴더의 git 브랜치 목록 + 현재 브랜치. git 저장소 아니면 branches:[] current:null.
  listBranches: (
    workdir: string,
  ) => Promise<{ branches: string[]; current: string | null }>;
  // 브랜치 체크아웃. 실패 시 ok:false + error(stderr).
  checkoutBranch: (
    workdir: string,
    branch: string,
  ) => Promise<{ ok: boolean; error?: string }>;
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
