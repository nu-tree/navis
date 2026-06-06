// navis 데스크톱 셸 (Electron).
// 우리 RN 컴포넌트를 react-native-web 으로 빌드한 web-build 를 로컬 HTTP 서버로
// 띄워 BrowserWindow 에 로드한다. (Expo 웹 빌드는 자산 경로가 절대경로라 file:// 불가)
const { app, BrowserWindow, shell, Notification, ipcMain, screen } = require('electron');
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

ipcMain.handle('navis-local:config:get', () => {
  const c = loadLocalConfig();
  // 토큰 원문은 노출하지 않음 — 존재 여부만.
  return {
    enabled: !!c.enabled,
    workdir: c.workdir || '',
    allowWrite: !!c.allowWrite,
    hasToken: !!(c.token || process.env.CLAUDE_CODE_OAUTH_TOKEN),
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

ipcMain.handle('navis-local:run', async (event, { id, prompt }) => {
  const cfg = loadLocalConfig();
  const token = cfg.token || process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!cfg.enabled) return { error: '로컬 에이전트가 꺼져 있어요(설정에서 켜기).' };
  if (!token) return { error: 'CLAUDE_CODE_OAUTH_TOKEN 이 없어요(설정에서 토큰 입력).' };
  if (!cfg.workdir) return { error: '작업 폴더가 설정되지 않았어요.' };
  try {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
    // 에이전트 SDK 는 ESM → CJS 메인에서 동적 import.
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    // 읽기 전용 기본. allowWrite 일 때만 쓰기/터미널 도구 추가.
    const readonly = ['Read', 'Grep', 'Glob', 'LS'];
    const writeTools = ['Edit', 'Write', 'Bash'];
    const allowedTools = cfg.allowWrite ? [...readonly, ...writeTools] : readonly;
    let text = '';
    for await (const m of query({
      prompt,
      options: {
        cwd: cfg.workdir,
        model: 'claude-opus-4-8',
        allowedTools,
        settingSources: [],
        includePartialMessages: true,
        permissionMode: cfg.allowWrite ? 'acceptEdits' : 'default',
      },
    })) {
      if (
        m.type === 'stream_event' &&
        m.event &&
        m.event.type === 'content_block_delta' &&
        m.event.delta &&
        m.event.delta.type === 'text_delta'
      ) {
        event.sender.send(`navis-local:delta:${id}`, m.event.delta.text);
      }
      if (m.type === 'result' && m.subtype === 'success') text = m.result;
    }
    return { text: text || '(빈 응답)' };
  } catch (err) {
    console.error('[local-agent] 실행 실패:', err);
    return { error: err && err.message ? err.message : String(err) };
  }
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
