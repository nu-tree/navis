// navis 데스크톱 셸 (Electron).
// 우리 RN 컴포넌트를 react-native-web 으로 빌드한 web-build 를 로컬 HTTP 서버로
// 띄워 BrowserWindow 에 로드한다. (Expo 웹 빌드는 자산 경로가 절대경로라 file:// 불가)
const { app, BrowserWindow, shell, Notification } = require('electron');
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
  const win = new BrowserWindow({
    // 데스크톱답게 넓게. 앱 레이아웃이 넓은 화면에선 사이드바+채팅으로 반응형 전환된다.
    // 저장된 크기·위치가 있으면 복원(없으면 기본값).
    width: saved.width ?? 1180,
    height: saved.height ?? 800,
    x: saved.x,
    y: saved.y,
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
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
// macOS(Apple Silicon)는 electron-builder 가 인증서 없이도 ad-hoc 서명을 자동으로 붙여서
// Squirrel.Mac 자동 다운로드 → 재시작 시 설치가 보통 동작한다(유료 Developer 인증서 불필요).
// Windows(nsis)도 동일. 그래서 기본은 자동 업데이트를 쓰고, 다운로드 완료/실패 시 한국어
// 알림을 직접 띄운다(electron-updater 기본 알림은 영어라 안 씀). 자동이 실패하는 환경에선
// 실패 알림이 다운로드 페이지로 안내한다.
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

    const showNotification = (title, body, onClick) => {
      try {
        const n = new Notification({ title, body });
        if (onClick) n.on('click', onClick);
        n.show();
      } catch (e) {
        console.error('[updater] 알림 실패:', e);
      }
    };

    // 새 버전 다운로드 완료 → 한국어 알림. 클릭하면 지금 재시작해 설치(아니면 다음 실행 때 적용).
    autoUpdater.on('update-downloaded', (info) => {
      showNotification(
        '나비스 업데이트 준비 완료',
        `v${info.version} 받았어요. 클릭하면 지금 재시작해서 설치할게요(아니면 다음에 켤 때 적용).`,
        () => autoUpdater.quitAndInstall(),
      );
    });

    // 자동 업데이트가 실패하는 환경(미서명 등)에선 그때만 수동 안내.
    autoUpdater.on('error', (err) => {
      console.error('[updater] 오류:', err);
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
