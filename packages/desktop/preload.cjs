// 렌더러(앱) ↔ 메인 프로세스 브리지.
// 로컬 에이전트(내 맥의 파일/터미널 접근)는 메인 프로세스에서만 실행되고, 그 호출구만
// 여기로 노출한다. 보안: 기본 비활성 + 읽기 전용. 쓰기/터미널은 사용자가 명시적으로
// "쓰기 허용"을 켜야만 가능(메인에서 게이트).
const { contextBridge, ipcRenderer } = require('electron');

let nextId = 1;

contextBridge.exposeInMainWorld('navisLocal', {
  // 데스크톱(Electron)에서만 주입됨 → 렌더러는 이 존재로 "로컬 에이전트 가용"을 판단.
  isDesktop: true,

  // 설정 조회/저장. 토큰은 돌려주지 않고 hasToken 불리언만 노출(노출 최소화).
  getConfig: () => ipcRenderer.invoke('navis-local:config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('navis-local:config:set', cfg),

  // prompt 를 로컬 에이전트로 실행. onDelta 로 토큰 스트리밍, 반환은 {text} 또는 {error}.
  run: (prompt, opts) => {
    const id = `run-${nextId++}`;
    const deltaCh = `navis-local:delta:${id}`;
    const onDelta = opts && opts.onDelta;
    const listener = (_e, text) => {
      if (onDelta) onDelta(text);
    };
    ipcRenderer.on(deltaCh, listener);
    return ipcRenderer
      .invoke('navis-local:run', { id, prompt })
      .finally(() => ipcRenderer.removeListener(deltaCh, listener));
  },
});
