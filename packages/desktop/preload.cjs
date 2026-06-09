// 렌더러(앱) ↔ 메인 프로세스 브리지.
// 로컬 에이전트(내 맥의 파일/터미널 접근)는 메인 프로세스에서만 실행되고, 그 호출구만
// 여기로 노출한다. 보안: 기본 비활성 + 읽기 전용. 쓰기/터미널은 사용자가 명시적으로
// "쓰기 허용"을 켜야만 가능(메인에서 게이트).
const { contextBridge, ipcRenderer } = require('electron');

let nextId = 1;
// 진행 중인 run id 들 — stop() 이 이걸 끊는다(보통 동시에 1개).
const activeRuns = new Set();

contextBridge.exposeInMainWorld('navisLocal', {
  // 데스크톱(Electron)에서만 주입됨 → 렌더러는 이 존재로 "로컬 에이전트 가용"을 판단.
  isDesktop: true,

  // 설정 조회/저장. 토큰은 돌려주지 않고 hasToken 불리언만 노출(노출 최소화).
  getConfig: () => ipcRenderer.invoke('navis-local:config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('navis-local:config:set', cfg),

  // 폴더 선택 다이얼로그 — 코드 세션의 작업 폴더를 고른다. 선택한 경로와 그 폴더의
  // namory 프로젝트명(폴더명 폴백)을 돌려준다. 취소하면 null.
  pickFolder: () => ipcRenderer.invoke('navis-local:pick-folder'),

  // 작업 폴더의 git 브랜치 목록·현재 브랜치 조회 / 브랜치 체크아웃.
  listBranches: (workdir) => ipcRenderer.invoke('navis-local:list-branches', { workdir }),
  checkoutBranch: (workdir, branch) =>
    ipcRenderer.invoke('navis-local:checkout-branch', { workdir, branch }),

  // prompt 를 로컬 에이전트로 실행. onDelta 로 토큰 스트리밍, 반환은 {text} 또는 {error}.
  run: (prompt, opts) => {
    const id = `run-${nextId++}`;
    const deltaCh = `navis-local:delta:${id}`;
    const onDelta = opts && opts.onDelta;
    const onTool = opts && opts.onTool;
    const onThinking = opts && opts.onThinking;
    // 메인이 보내는 메시지는 { k, v } — 종류별로 콜백 분기(답변/도구/생각).
    // 구버전(문자열) 호환: 객체가 아니면 답변 델타로 취급.
    const listener = (_e, msg) => {
      if (msg && typeof msg === 'object') {
        if (msg.k === 'tool') {
          if (onTool) onTool(msg.v);
        } else if (msg.k === 'think') {
          if (onThinking) onThinking(msg.v);
        } else if (onDelta) {
          onDelta(msg.v);
        }
        return;
      }
      if (onDelta) onDelta(msg);
    };
    ipcRenderer.on(deltaCh, listener);
    activeRuns.add(id);
    return ipcRenderer
      .invoke('navis-local:run', {
        id,
        prompt,
        resume: opts && opts.resume,
        // 이 코드 세션의 작업 폴더(세션별). 없으면 메인이 전역 설정으로 폴백.
        workdir: opts && opts.workdir,
        // namory 좌표(코드 세션 기억 연결). 없으면 순정 코드 에이전트.
        namory: opts && opts.namory,
      })
      .finally(() => {
        activeRuns.delete(id);
        ipcRenderer.removeListener(deltaCh, listener);
      });
  },

  // 생성 중단(클로드 코드의 Esc). 진행 중인 모든 run 을 끊는다.
  stop: () => {
    for (const id of activeRuns) void ipcRenderer.invoke('navis-local:stop', { id });
  },
});

// 자동 업데이트 ↔ 인앱 배너 브리지. 렌더러는 onStatus 로 상태를 구독하고, 새 버전을
// 감지하면 check() 로 다운로드를 트리거, 화살표를 누르면 install() 로 재시작·설치한다.
contextBridge.exposeInMainWorld('navisUpdate', {
  isDesktop: true,
  // 현재 설치된 앱 버전(렌더러가 서버 최신과 비교) — preload 시점에 동기 조회.
  currentVersion: ipcRenderer.sendSync('navis-update:version'),
  check: () => ipcRenderer.invoke('navis-update:check'),
  install: () => ipcRenderer.invoke('navis-update:install'),
  openDownload: () => ipcRenderer.invoke('navis-update:open-download'),
  // 업데이트 상태 구독. 반환값으로 해제 함수 제공.
  onStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on('navis-update:status', listener);
    return () => ipcRenderer.removeListener('navis-update:status', listener);
  },
});
