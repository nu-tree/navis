// navis 데스크톱 셸 (Electron).
// 우리 RN 컴포넌트를 react-native-web 으로 빌드한 web-build 를 로컬 HTTP 서버로
// 띄워 BrowserWindow 에 로드한다. (Expo 웹 빌드는 자산 경로가 절대경로라 file:// 불가)
const { app, BrowserWindow, shell, Notification, ipcMain, screen, dialog } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const handler = require('serve-handler');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.ELECTRON_DEV === '1';
const WEB_DIR = path.join(__dirname, 'web-build');

let server;

// 창 크기·위치·최대화/전체화면 상태를 저장해 다음 실행 때 복원(클로드 데스크톱처럼).
function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'));
  } catch {
    return {};
  }
}

// 저장된 창 위치가 현재 연결된 디스플레이 중 하나에라도 걸쳐 있는지 검사.
// 외장 모니터를 빼면 옛 좌표가 화면 밖이 돼 창이 "사라진" 것처럼 보이는 걸 막는다.
function isOnSomeDisplay(b) {
  if (b.x == null || b.y == null) return true; // 저장된 위치 없음 → 기본 센터링
  const w = b.width ?? 1180;
  const h = b.height ?? 800;
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    return b.x < wa.x + wa.width && b.x + w > wa.x && b.y < wa.y + wa.height && b.y + h > wa.y;
  });
}

function saveWindowState(win) {
  try {
    if (win.isDestroyed()) return;
    // getNormalBounds: 최대화/전체화면이어도 '평상시' 크기를 돌려줌(복원용).
    const bounds = win.getNormalBounds();
    fs.writeFileSync(
      windowStateFile(),
      JSON.stringify({
        ...bounds,
        isMaximized: win.isMaximized(),
        isFullScreen: win.isFullScreen(),
      }),
    );
  } catch (err) {
    console.error('[window] 상태 저장 실패:', err);
  }
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) =>
      handler(req, res, {
        public: WEB_DIR,
        // SPA: 모든 경로를 index.html 로 폴백
        rewrites: [{ source: '**', destination: '/index.html' }],
      }),
    );
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

async function createWindow() {
  const saved = loadWindowState();
  const onScreen = isOnSomeDisplay(saved);
  const win = new BrowserWindow({
    // 데스크톱답게 넓게. 앱 레이아웃이 넓은 화면에선 사이드바+채팅으로 반응형 전환된다.
    // 저장된 크기·위치가 있으면 복원(없으면 기본값).
    width: saved.width ?? 1180,
    height: saved.height ?? 800,
    x: onScreen ? saved.x : undefined,
    y: onScreen ? saved.y : undefined,
    minWidth: 720,
    minHeight: 560,
    // 마우스 드래그 리사이즈·최대화·전체화면 모두 명시적으로 허용(클로드 데스크톱처럼).
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    title: '나비스',
    icon: path.join(__dirname, '../app/assets/navis-logo.png'),
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    // 클로드 데스크톱처럼 네이티브(회색) 타이틀바를 없애고 콘텐츠를 끝까지 채운다.
    // macOS: hiddenInset — 제목 막대는 사라지고 트래픽 라이트(빨강·노랑·초록)만
    // 콘텐츠 위에 뜬다. 창 이동은 렌더러 상단의 드래그 스트립(app-region:drag)이 담당.
    // Windows: 타이틀바를 숨기고 오버레이로 창 컨트롤만 그린다.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' }
      : process.platform === 'win32'
        ? {
            titleBarStyle: 'hidden',
            titleBarOverlay: { color: '#0b0b0f', symbolColor: '#e5e7eb', height: 36 },
          }
        : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 창을 접어둬도(가려져도) 렌더러 타이머를 죽이지 않는다. 기본값(true)이면
      // Electron 이 숨긴 창의 타이머를 throttle/정지시켜, 보고 폴링이 멈추고
      // 다시 펼칠 때 알림이 한꺼번에 늦게 뜬다(백그라운드 알림의 의미가 없어짐).
      backgroundThrottling: false,
      // 코드 탭 미리보기 패널에서 <webview> 태그로 로컬 서버를 임베드하기 위해 필요.
      webviewTag: true,
    },
  });

  // 지난 실행에서 최대화/전체화면이었으면 그 상태로 복원.
  if (saved.isMaximized) win.maximize();
  if (saved.isFullScreen) win.setFullScreen(true);

  // 크기·위치·전체화면 변화를 디바운스 저장하고, 닫을 때 최종 저장.
  let saveTimer;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win), 400);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('enter-full-screen', scheduleSave);
  win.on('leave-full-screen', scheduleSave);
  win.on('close', () => {
    clearTimeout(saveTimer);
    saveWindowState(win);
  });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    // 개발: Expo 웹 dev 서버(packages/app 에서 `pnpm web`). 아직 안 떴을 수 있으니
    // 붙을 때까지 재시도 — 두 프로세스 시작 순서에 안 휘둘리고, ERR_CONNECTION_REFUSED 로
    // 죽지 않게. 서버가 뜨면 자동으로 로드된다.
    const devUrl = 'http://localhost:8081';
    for (let i = 0; i < 120; i++) {
      try {
        await win.loadURL(devUrl);
        break;
      } catch {
        if (i === 0) console.log(`[dev] ${devUrl} 대기 중… (packages/app 에서 pnpm web 실행)`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } else {
    const port = await startStaticServer();
    await win.loadURL(`http://127.0.0.1:${port}`);
  }
}

// 자동 업데이트: GitHub Releases 대신 navis(Railway)를 generic provider 로 본다.
// 빌드 시 워크플로가 updater-config.json({url, token})을 구워 넣으면, 그 URL 의
// latest*.yml 을 토큰 헤더로 폴링한다. 파일이 없으면 조용히 비활성.
//
// macOS: Squirrel.Mac 은 "설치된 앱 == 새 버전"의 코드서명 신원이 일치해야만 교체한다.
// 미서명/ad-hoc 은 빌드마다 신원이 달라 거부되므로 → CI 가 자가서명(self-signed) 인증서로
// 서명한다(유료 Developer 인증서 불필요. scripts/make-selfsigned-cert.sh 로 한 번 생성).
// Windows(nsis)는 미서명이어도 자동업데이트가 된다. 기본은 자동 업데이트를 쓰고, 다운로드
// 완료/실패 시 한국어 알림을 직접 띄운다(electron-updater 기본 알림은 영어라 안 씀). 인증서가
// 없어 미서명으로 빌드된 환경에선 자동설치가 실패 → 실패 알림이 다운로드 페이지로 안내한다.
// 업데이터 ↔ 렌더러(인앱 배너) 공유 상태.
let updaterReady = false; // updater-config 가 있어 피드가 설정됐는지
let updaterDownloadPage = null; // adhoc 설치 실패 시 폴백할 수동 다운로드 페이지

// 렌더러(앱)에 업데이트 상태를 보낸다 → 인앱 배너가 구독. 창이 아직 없으면 조용히 무시.
function sendUpdateStatus(status) {
  const w = BrowserWindow.getAllWindows()[0];
  if (w && !w.isDestroyed()) w.webContents.send('navis-update:status', status);
}

function configureUpdater() {
  try {
    const cfgPath = path.join(__dirname, 'updater-config.json');
    if (!fs.existsSync(cfgPath)) return;
    const { url, token } = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!url) return;
    autoUpdater.setFeedURL({ provider: 'generic', url });
    if (token) autoUpdater.requestHeaders = { Authorization: `Bearer ${token}` };

    // 수동 설치용 다운로드 페이지 = 피드 베이스(.../api/desktop/file)에서 유도.
    const downloadPage = url.replace(/\/api\/desktop\/file\/?$/, '/download');
    updaterReady = true;
    updaterDownloadPage = downloadPage;

    const showNotification = (title, body, onClick) => {
      try {
        const n = new Notification({ title, body });
        if (onClick) n.on('click', onClick);
        n.show();
      } catch (e) {
        console.error('[updater] 알림 실패:', e);
      }
    };

    // 새 버전 다운로드 완료 → ① 인앱 배너(주 채널) ② 백업용 OS 알림.
    //   배너 화살표/알림 클릭 모두 quitAndInstall 로 이어진다(=클로드코드처럼 "다시 시작").
    autoUpdater.on('update-downloaded', (info) => {
      sendUpdateStatus({ state: 'downloaded', version: info.version });
      showNotification(
        '나비스 업데이트 준비 완료',
        `v${info.version} 받았어요. 클릭하면 지금 재시작해서 설치할게요(아니면 다음에 켤 때 적용).`,
        () => autoUpdater.quitAndInstall(),
      );
    });

    // 자동 설치가 실패하는 환경(adhoc 미서명 등) → 배너가 "직접 받기"로 전환되도록 신호.
    autoUpdater.on('error', (err) => {
      console.error('[updater] 오류:', err);
      sendUpdateStatus({ state: 'error', downloadPage });
      showNotification(
        '나비스 자동 업데이트 실패',
        '클릭하면 다운로드 페이지에서 직접 받을 수 있어요.',
        () => void shell.openExternal(downloadPage),
      );
    });

    // 모든 플랫폼 자동 다운로드(autoDownload 기본 true). checkForUpdatesAndNotify 대신
    // checkForUpdates 를 써서 알림 문구를 위처럼 한국어로 직접 띄운다.
    void autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[updater] 설정 실패:', err);
  }
}

// ── 로컬 에이전트 (실험적) ──────────────────────────────────────────────
// 이 맥의 파일/터미널에 접근하는 에이전트를 메인 프로세스(Node)에서 실행한다.
// 보안 기본값: enabled=false, allowWrite=false(읽기 전용). 쓰기/Bash 는 allowWrite 를
// 켰을 때만 도구 목록에 포함된다. 모델 호출은 CLAUDE_CODE_OAUTH_TOKEN(설정 또는 env).
function localConfigFile() {
  return path.join(app.getPath('userData'), 'local-agent.json');
}
function loadLocalConfig() {
  try {
    return JSON.parse(fs.readFileSync(localConfigFile(), 'utf8'));
  } catch {
    return { enabled: false, workdir: '', allowWrite: false, token: '' };
  }
}
function saveLocalConfig(cfg) {
  fs.writeFileSync(localConfigFile(), JSON.stringify(cfg));
}

// 진행 중인 코드 세션 run id → AbortController. "정지" 버튼이 이걸로 생성을 끊는다.
const runAborts = new Map();

// 작업 폴더에서 위로 올라가며 namory 프로젝트명을 감지한다(navis CLI 의 detectProject 와
// 동일 규칙). 우선순위: ① .navis 파일(한 줄 오버라이드) ② package.json 의 name.
// 못 찾으면 폴더 이름으로 폴백 — 코드 세션은 늘 어떤 폴더에서 도니까.
function detectProjectFromDir(startDir) {
  if (!startDir) return undefined;
  let dir = path.resolve(startDir);
  for (;;) {
    try {
      const navisFile = path.join(dir, '.navis');
      if (fs.existsSync(navisFile)) {
        const name = fs.readFileSync(navisFile, 'utf8').trim().split('\n')[0]?.trim();
        if (name) return name;
      }
      const pkg = path.join(dir, 'package.json');
      if (fs.existsSync(pkg)) {
        const parsed = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (typeof parsed.name === 'string' && parsed.name.trim()) {
          return parsed.name.includes('/') ? path.basename(parsed.name) : parsed.name;
        }
      }
    } catch {
      // 읽기/파싱 실패는 무시하고 위로.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.basename(path.resolve(startDir)) || undefined;
}

ipcMain.handle('navis-local:config:get', () => {
  const c = loadLocalConfig();
  // 토큰 원문은 노출하지 않음 — 존재 여부만. project 는 작업 폴더에서 감지해 코드 바에 표시.
  return {
    enabled: !!c.enabled,
    workdir: c.workdir || '',
    allowWrite: !!c.allowWrite,
    hasToken: !!(c.token || process.env.CLAUDE_CODE_OAUTH_TOKEN),
    project: c.workdir ? detectProjectFromDir(c.workdir) : undefined,
  };
});

ipcMain.handle('navis-local:config:set', (_e, patch) => {
  const c = loadLocalConfig();
  const next = {
    enabled: patch.enabled ?? c.enabled,
    workdir: patch.workdir ?? c.workdir,
    allowWrite: patch.allowWrite ?? c.allowWrite,
    // 토큰은 빈 문자열이 아닐 때만 갱신(빈 값으로 덮어쓰지 않음).
    token: patch.token ? patch.token : c.token,
  };
  saveLocalConfig(next);
  return { ok: true };
});

// 코드 세션 작업 폴더 선택 — 네이티브 폴더 다이얼로그. 선택 경로 + 그 폴더의 namory
// 프로젝트명(폴더명 폴백)을 돌려준다. 취소하면 null. 세션이 이 결과로 폴더를 박는다.
ipcMain.handle('navis-local:pick-folder', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const res = await dialog.showOpenDialog(win, {
    title: '코드 세션 작업 폴더 선택',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
  const workdir = res.filePaths[0];
  return { workdir, project: detectProjectFromDir(workdir) };
});

// 코드 세션 작업 폴더의 git 브랜치 목록 + 현재 브랜치를 돌려준다. git 저장소가 아니거나
// git 이 없으면 branches:[] current:null (에러 아님 — 호출부가 '저장소 아님'으로 처리).
ipcMain.handle('navis-local:list-branches', (_e, { workdir }) => {
  const { execFileSync } = require('child_process');
  if (!workdir) return { branches: [], current: null };
  try {
    const out = execFileSync('git', ['branch', '--format=%(refname:short)'], {
      cwd: workdir,
      encoding: 'utf8',
      timeout: 5000,
    });
    const branches = out
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);
    let current = null;
    try {
      current = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: workdir,
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
    } catch {
      /* detached HEAD 등 — current 없이 목록만 */
    }
    return { branches, current };
  } catch {
    return { branches: [], current: null };
  }
});

// 작업 폴더에서 git 브랜치 체크아웃. 더티 트리·충돌 등으로 실패하면 stderr 를 그대로 전달.
ipcMain.handle('navis-local:checkout-branch', (_e, { workdir, branch }) => {
  const { execFileSync } = require('child_process');
  if (!workdir || !branch) return { ok: false, error: '작업 폴더/브랜치가 비어 있어' };
  try {
    execFileSync('git', ['checkout', branch], {
      cwd: workdir,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true };
  } catch (err) {
    const msg = (err && (err.stderr || err.message)) || '체크아웃 실패';
    return { ok: false, error: String(msg).trim().slice(0, 300) };
  }
});

// 도구 사용을 클로드 코드처럼 한 줄로 요약 — 코드 세션 본문에 인라인 스트리밍한다.
function formatToolUse(name, input) {
  const i = input || {};
  // 서브에이전트 호출(Task) — 코드 리뷰어 등 독립 검토.
  if (name === 'Task') {
    const what = String(i.description || i.subagent_type || '서브에이전트').replace(/\s+/g, ' ').trim();
    return `\n🔎 서브에이전트 · ${what.slice(0, 60)}\n`;
  }
  // namory 기억 도구는 따로 라벨링(🧠 떠올림 / 💾 저장).
  if (name && name.startsWith('mcp__namory__')) {
    const op = name.slice('mcp__namory__'.length);
    const label =
      {
        recall: '🧠 기억 떠올림',
        recent: '🧠 최근 기억',
        save: '💾 기억 저장',
        pattern: '🧠 패턴',
        todos: '🧠 할 일',
        graphify: '🕸 기억 그래프',
      }[op] || `🧠 ${op}`;
    const hint = String(i.query || i.content || '').replace(/\s+/g, ' ').trim();
    return `\n${label}${hint ? ` · ${hint.slice(0, 60)}` : ''}\n`;
  }
  // TodoWrite: 멀티스텝 계획을 체크리스트로 펼쳐 보여준다(클로드 코드 느낌).
  if (name === 'TodoWrite' && Array.isArray(i.todos)) {
    const mark = { completed: '✓', in_progress: '🔄', pending: '☐' };
    const lines = i.todos
      .map((t) => `  ${mark[t && t.status] || '☐'} ${(t && (t.content || t.activeForm)) || ''}`)
      .join('\n');
    return `\n📋 할 일\n${lines}\n`;
  }
  const icon =
    { Read: '📖', Edit: '✏️', Write: '📝', Bash: '⌘', Grep: '🔎', Glob: '🔎', LS: '📂', WebSearch: '🌐', WebFetch: '🌐' }[
      name
    ] || '🔧';
  let arg = '';
  if (name === 'Bash') arg = i.command || '';
  else if (name === 'Grep' || name === 'Glob') arg = i.pattern || i.path || '';
  else arg = i.file_path || i.path || i.notebook_path || '';
  arg = String(arg).replace(/\s+/g, ' ').trim();
  if (arg.length > 80) arg = arg.slice(0, 80) + '…';
  return `\n${icon} ${name}${arg ? ` · ${arg}` : ''}\n`;
}

ipcMain.handle('navis-local:run', async (event, { id, prompt, resume, workdir, namory }) => {
  const cfg = loadLocalConfig();
  const token = cfg.token || process.env.CLAUDE_CODE_OAUTH_TOKEN;
  // 코드 탭은 항상 로컬 — 별도 '로컬 모드' 토글 없음. 세션이 고른 폴더(workdir)를
  // 우선 쓰고, 없으면 전역 설정으로 폴백한다.
  const dir = workdir || cfg.workdir;
  if (!token) return { error: 'CLAUDE_CODE_OAUTH_TOKEN 이 없어요(설정에서 토큰 입력).' };
  if (!dir) return { error: '작업 폴더를 먼저 선택해주세요(+폴더).' };

  // macOS 에서 Dock/Finder 실행 시 PATH 가 /usr/bin:/bin 수준으로 빈약해
  // claude CLI(~/.local/bin)를 못 찾아 spawn ENOTDIR/ENOENT 가 난다.
  // 알려진 설치 위치를 PATH 에 선제 주입한다.
  const extraPaths = [
    `${require('os').homedir()}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].join(':');
  process.env.PATH = `${extraPaths}:${process.env.PATH || ''}`;

  // SDK 가 import.meta.url 기준으로 claude 바이너리를 찾는데, 패키징된 앱에선
  // import.meta.url 이 .asar 내부를 가리켜 spawn ENOTDIR 이 난다.
  // pathToClaudeCodeExecutable 로 실제 파일시스템 경로를 직접 지정한다.
  let claudeExecPath;
  try {
    const { execFileSync } = require('child_process');
    claudeExecPath = execFileSync('which', ['claude'], {
      env: { ...process.env },
      encoding: 'utf8',
    }).trim();
  } catch {
    // which 실패 시 알려진 기본 설치 경로로 폴백
    claudeExecPath = `${require('os').homedir()}/.local/share/claude/versions/current`;
    try {
      // symlink 실제 경로 resolve
      const link = require('fs').readlinkSync(`${require('os').homedir()}/.local/bin/claude`);
      claudeExecPath = link.startsWith('/') ? link : require('path').resolve(`${require('os').homedir()}/.local/bin`, link);
    } catch {
      claudeExecPath = `${require('os').homedir()}/.local/bin/claude`;
    }
  }

  // 경로가 실제 디렉토리인지 확인 — 존재하지 않거나 파일이면 spawn ENOTDIR 대신 친절한 에러.
  try {
    const stat = require('fs').statSync(dir);
    if (!stat.isDirectory()) return { error: `작업 폴더가 디렉토리가 아닙니다: ${dir}` };
  } catch {
    return { error: `작업 폴더를 찾을 수 없어요: ${dir}\n+폴더에서 다시 선택해주세요.` };
  }
  // catch/finally 에서도 접근하도록 try 밖에 선언(중단 시 부분 결과 반환용).
  let streamed = '';
  let finalText = '';
  let sessionId = resume || undefined;
  try {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
    // 에이전트 SDK 는 ESM → CJS 메인에서 동적 import.
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    // 읽기 전용 기본 + 웹 검색/문서·멀티스텝 계획(TodoWrite) 도구는 안전하니 항상 포함
    // (클로드 코드 기본기). allowWrite 일 때만 쓰기/터미널/긴명령 관리 도구 추가.
    const readonly = ['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'TodoWrite'];
    const writeTools = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'BashOutput', 'KillShell'];
    const fileTools = cfg.allowWrite ? [...readonly, ...writeTools] : readonly;

    // 이 폴더가 어떤 namory 프로젝트인지 — 기억 recall/save 를 이 프로젝트로 태깅.
    // (폴더명 폴백이라, 기억이 없던 폴더는 이 태그로 첫 저장 시 프로젝트가 자동 생성됨.)
    const project = detectProjectFromDir(dir);

    // namory 좌표(url/token)가 오면 HTTP MCP 로 붙여 기억 recall/save 를 쥐여준다
    // (서버 채팅 ask.ts 와 동일 배선). 없으면 순정 코드 에이전트로 동작.
    const NAMORY_TOOLS = [
      'mcp__namory__recall',
      'mcp__namory__recent',
      'mcp__namory__save',
      'mcp__namory__pattern',
      'mcp__namory__todos',
      // 프로젝트 기억 그래프 — 누적 지식의 전체 그림(구조 지도 보강용).
      'mcp__namory__graphify',
    ];
    const useNamory = !!(namory && namory.url && namory.token);

    // Playwright MCP — 코드 세션에서 브라우저 제어·스크린샷·클릭 등을 쓸 수 있게.
    // allowWrite(작업 모드)에서만 활성화. node 경로는 Electron 번들 기준으로 resolve.
    let playwrightServer;
    if (cfg.allowWrite) {
      try {
        const mcpPkg = require.resolve('@playwright/mcp/package.json');
        // .asar 아카이브 안 경로는 spawn 불가(ENOTDIR) — 반드시 실제 파일시스템이어야 함.
        if (mcpPkg.includes('.asar')) throw new Error('asar-bundled, skip');
        const playwrightMcpDir = require('path').dirname(mcpPkg);
        const playwrightMcpCli = require('path').join(playwrightMcpDir, 'cli.js');
        // cli.js 가 실제 파일로 존재하는지 재확인.
        require('fs').statSync(playwrightMcpCli);
        playwrightServer = {
          type: 'stdio',
          command: 'node',
          args: [playwrightMcpCli, '--headless'],
          env: { ...process.env },
        };
      } catch {
        // @playwright/mcp 없거나 ASAR 번들이면 조용히 스킵
      }
    }

    const mcpServers = {
      ...(useNamory ? {
        namory: {
          type: 'http',
          url: namory.url,
          headers: { Authorization: `Bearer ${namory.token}` },
          alwaysLoad: true,
        },
      } : {}),
      ...(playwrightServer ? { browser: playwrightServer } : {}),
    };
    const hasMcp = Object.keys(mcpServers).length > 0;

    // 쓰기 모드에선 독립 코드 리뷰어 서브에이전트를 등록한다 — 메인 에이전트가 수정 후
    // Task 로 호출해 자기 변경을 비판적으로 재검토받는다(단일 패스보다 버그를 더 잡음).
    const agents = cfg.allowWrite
      ? {
          'code-reviewer': {
            description:
              '코드 변경(diff)을 비판적으로 검토해 버그·회귀·엣지케이스 누락·타입/보안 문제를 찾는 독립 리뷰어. 파일을 수정한 뒤 마무리 전에 호출.',
            tools: ['Read', 'Grep', 'Glob', 'LS', 'Bash', 'BashOutput'],
            model: 'inherit',
            // 검토는 짧게 — 무한 탐색 방지.
            maxTurns: 15,
            prompt:
              '너는 깐깐하고 회의적인 시니어 코드 리뷰어다. `git diff`(필요시 주변 파일 Read)로 이번 변경만 본다. ' +
              '명백한 버그·회귀·엣지케이스 누락·타입 오류·리소스 누수·보안 문제를 코드 근거와 함께 구체적으로 지적하라. ' +
              '추측·스타일 트집은 금지. 실제 문제만, 심각도와 위치(파일:라인)를 붙여 간결히. ' +
              '문제가 없으면 정확히 "이상 없음"이라고만 답하라. 너는 지적만 하고 코드를 직접 고치지 않는다.',
          },
        }
      : undefined;

    const PLAYWRIGHT_TOOLS = playwrightServer ? ['mcp__browser'] : [];
    const allowedTools = [
      ...fileTools,
      ...(useNamory ? NAMORY_TOOLS : []),
      ...(agents ? ['Task'] : []),
      ...PLAYWRIGHT_TOOLS,
    ];

    // 클로드 코드 기본 시스템 프롬프트(코딩 실력의 핵심)를 켜고, navis 만의 강점인
    // "누적 프로젝트 기억(플라이휠)"과 자기검증 지침을 덧붙인다. preset 미명시 시
    // SDK 는 빈 프롬프트로 돌아 코딩이 약해진다. settingSources 로 CLAUDE.md 도 로드.
    //
    // 클로드 코드를 넘어서는 지점은 모델이 아니라 "맥락"이다:
    //  ① 세션 시작 시 이 프로젝트의 과거 결정/관례/함정을 강제로 recall → 콜드스타트 제거
    //  ② 턴이 끝나면 새 결정/함정/구조를 save → 다음 세션이 더 똑똑해짐(복리)
    //  ③ 코드 수정 후 자기 diff 를 재검증 → 단일 패스보다 버그를 더 잡음
    let append = '';
    if (project) {
      append += `\n\n[프로젝트] 현재 작업 중인 프로젝트는 "${project}" 다. 레포의 CLAUDE.md 가 있으면 그 지침을 우선 따른다.`;
    }
    if (useNamory && project) {
      append +=
        `\n\n[프로젝트 기억 — navis 의 핵심 강점, 반드시 활용]\n` +
        `너는 이 프로젝트를 이전에도 다뤘고 그 기억이 namory 에 쌓여 있다. 백지에서 시작하지 마라.\n` +
        `- 작업 시작 시: 본격적으로 코드를 건드리기 전에 mcp__namory__recall 을 query 를 바꿔가며 1~2회 호출해 ` +
        `이 프로젝트(project: "${project}")의 과거 결정·관례·함정·구조를 먼저 떠올려라.\n` +
        `- 구조 지도: 본격 탐색 전에 "[구조 지도]" 로 시작하는 기억을 recall 해 이 프로젝트의 ` +
        `아키텍처·핵심 파일/디렉터리·관례·빌드/테스트 명령을 먼저 떠올려 불필요한 재탐색을 건너뛰어라. ` +
        `없거나 낡았으면 빠르게 파악한 뒤 "[구조 지도]" 로 시작하는 내용으로 save(project: "${project}") 해 다음 세션이 재사용하게 하라. ` +
        `전체 지식 그림이 필요하면 mcp__namory__graphify 로 기억 그래프를 본다.\n` +
        `- 작업 종료 시: 이번에 내린 설계 결정, 부딪힌 함정, 알아낸 파일 구조/관례 중 ` +
        `"다음 세션의 나에게 유용할 것"을 mcp__namory__save 로 저장하되 반드시 project: "${project}" 태그를 달아라. ` +
        `사소한 건 말고 재사용 가치가 있는 것만 간결하게.`;
    }
    if (cfg.allowWrite) {
      append +=
        `\n\n[자기검증 — 단일 패스로 끝내지 말 것] 파일을 수정한 뒤 마무리 전에:\n` +
        `1) git diff 로 네 변경을 직접 재검토해 명백한 버그·누락·문법오류를 잡고,\n` +
        `2) 변경이 사소하지 않으면 Task 로 code-reviewer 서브에이전트를 호출해 독립 검토를 받아라.\n` +
        `리뷰어가 지적한 실제 문제는 고친 뒤 마무리하라.`;
    }
    const systemPrompt = { type: 'preset', preset: 'claude_code', ...(append ? { append } : {}) };

    const send = (s) => event.sender.send(`navis-local:delta:${id}`, s);
    // 사용자가 "정지"를 누르면 이 컨트롤러로 생성을 중단한다(클로드 코드의 Esc).
    const abortController = new AbortController();
    runAborts.set(id, abortController);
    // streamed/finalText/sessionId 는 try 밖에서 선언됨(중단 시 부분 결과 반환).
    // 스트리밍한 본문(도구 사용 줄 포함)을 그대로 모아 최종 text 로 돌려준다 —
    // 렌더러가 마지막에 권위 텍스트로 덮어써도 도구 사용 내역이 사라지지 않게.
    for await (const m of query({
      prompt,
      options: {
        cwd: dir,
        model: 'claude-opus-4-8',
        systemPrompt,
        allowedTools,
        abortController,
        ...(agents ? { agents } : {}),
        ...(hasMcp ? { mcpServers } : {}),
        // CLAUDE.md + 레포/유저 .claude 설정을 로드해 클로드 코드와 동일하게 프로젝트에
        // 그라운딩한다(빈 배열이면 CLAUDE.md 가 안 읽혀 맥락이 빈약해짐).
        settingSources: ['user', 'project', 'local'],
        includePartialMessages: true,
        // 전체 제어 모드(allowWrite): bypassPermissions — 확인 없이 모든 도구/명령을
        // 실행한다(클로드 코드처럼 시뮬레이터 설치·xcodebuild·brew 등 내 맥 전체 조작).
        // 끄면 기본(읽기 전용 안전모드). 토글이 곧 "전체 제어" 스위치.
        permissionMode: cfg.allowWrite ? 'bypassPermissions' : 'default',
        // resume 가 있으면 이전 코드 세션을 이어간다(멀티턴).
        ...(resume ? { resume } : {}),
        // 패키징된 앱에서 SDK 가 .asar 내부 경로로 바이너리를 찾지 않도록
        // 실제 파일시스템의 claude CLI 경로를 명시한다(spawn ENOTDIR 방지).
        pathToClaudeCodeExecutable: claudeExecPath,
      },
    })) {
      // SDK 세션 id 포착 — 다음 턴 resume 용.
      if (m.session_id) sessionId = m.session_id;

      if (
        m.type === 'stream_event' &&
        m.event &&
        m.event.type === 'content_block_delta' &&
        m.event.delta &&
        m.event.delta.type === 'text_delta'
      ) {
        streamed += m.event.delta.text;
        send(m.event.delta.text);
      }
      // 도구 사용(파일 읽기/수정/터미널 등)을 한 줄로 인라인 표시 — "클로드 코드" 느낌.
      if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
        for (const block of m.message.content) {
          if (block && block.type === 'tool_use') {
            const line = formatToolUse(block.name, block.input);
            streamed += line;
            send(line);
          }
        }
      }
      if (m.type === 'result' && m.subtype === 'success') finalText = m.result;
    }
    // 도구 줄을 흘렸으면 그 전체 트랜스크립트를, 아니면 최종 답변만.
    const text = streamed.trim() ? streamed : finalText || '(빈 응답)';
    return { text, sessionId };
  } catch (err) {
    // 사용자가 정지를 눌러 중단된 경우: 지금까지 받은 내용 + 표식으로 부드럽게 마무리.
    const aborted =
      runAborts.get(id)?.signal.aborted ||
      (err && (err.name === 'AbortError' || /abort/i.test(String(err.message || err))));
    if (aborted) {
      const partial = (streamed || '').trim();
      return { text: partial ? `${partial}\n\n⏹ 중단했어.` : '⏹ 중단했어.', sessionId };
    }
    console.error('[local-agent] 실행 실패:', err);
    return { error: err && err.message ? err.message : String(err) };
  } finally {
    runAborts.delete(id);
  }
});

// 생성 중인 코드 세션을 중단(정지 버튼). 해당 run 의 AbortController 를 발동시킨다.
ipcMain.handle('navis-local:stop', (_e, { id }) => {
  const ac = runAborts.get(id);
  if (ac) ac.abort();
  return { ok: !!ac };
});

// ── 자동 업데이트 인앱 제어 (렌더러 배너용) ────────────────────────────────
// 현재 설치된 앱 버전 — 렌더러가 서버 최신버전과 비교해 "새 버전 있음"을 판단.
ipcMain.on('navis-update:version', (e) => {
  e.returnValue = app.getVersion();
});
// 렌더러가 "서버에 더 높은 버전 있다"를 감지하면 호출 → 즉시 업데이트 확인/다운로드 트리거.
// (앱이 어차피 navis 를 30초마다 폴링하므로, 재시작 없이 릴리스 직후 잡힌다.)
ipcMain.handle('navis-update:check', () => {
  if (!updaterReady) return null; // updater-config 없음(개발/미설정) → 무시.
  return autoUpdater.checkForUpdates().catch((err) => {
    console.error('[updater] check 실패:', err);
    return null;
  });
});
// 배너 화살표 → 재시작해서 설치. adhoc 서명이면 실제 실패는 'error' 이벤트로 올라와
// 배너가 "직접 받기"로 전환된다(아래 open-download).
ipcMain.handle('navis-update:install', () => {
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (err) {
    console.error('[updater] quitAndInstall 실패:', err);
    if (updaterDownloadPage) void shell.openExternal(updaterDownloadPage);
    return { ok: false };
  }
});
// 자동 설치 불가 환경(adhoc) → 다운로드 페이지를 기본 브라우저로 연다.
ipcMain.handle('navis-update:open-download', () => {
  if (updaterDownloadPage) void shell.openExternal(updaterDownloadPage);
  return { ok: true };
});

app.whenReady().then(() => {
  void createWindow();
  // 패키징된 빌드에서만 자동 업데이트 확인.
  if (!isDev) configureUpdater();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});
