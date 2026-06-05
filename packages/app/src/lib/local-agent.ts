// 데스크톱(Electron) 로컬 에이전트 브리지 래퍼. preload.cjs 가 window.navisLocal 을
// 주입한 환경(데스크톱)에서만 존재한다. 모바일/웹(비-Electron)에선 undefined.

export type LocalAgentConfig = {
  enabled: boolean;
  workdir: string;
  allowWrite: boolean;
  hasToken: boolean;
};

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
    opts?: { onDelta?: (text: string) => void },
  ) => Promise<{ text?: string; error?: string }>;
};

function getApi(): LocalAgentApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as unknown as { navisLocal?: LocalAgentApi }).navisLocal;
  return api && api.isDesktop ? api : undefined;
}

export const localAgent = getApi();
export const hasLocalAgent = !!localAgent;
