// navis 데스크톱 셸 (Electron).
// 우리 RN 컴포넌트를 react-native-web 으로 빌드한 web-build 를 로컬 HTTP 서버로
// 띄워 BrowserWindow 에 로드한다. (Expo 웹 빌드는 자산 경로가 절대경로라 file:// 불가)
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const handler = require('serve-handler');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.ELECTRON_DEV === '1';
const WEB_DIR = path.join(__dirname, 'web-build');

let server;

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
  const win = new BrowserWindow({
    // 데스크톱답게 넓게. 앱 레이아웃이 넓은 화면에선 사이드바+채팅으로 반응형 전환된다.
    width: 1180,
    height: 800,
    minWidth: 720,
    minHeight: 560,
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

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    // 개발: Expo 웹 dev 서버 (packages/app 에서 `pnpm web` 먼저 실행)
    await win.loadURL('http://localhost:8081');
  } else {
    const port = await startStaticServer();
    await win.loadURL(`http://127.0.0.1:${port}`);
  }
}

// 자동 업데이트: GitHub Releases 대신 navis(Railway)를 generic provider 로 본다.
// 빌드 시 워크플로가 updater-config.json({url, token})을 구워 넣으면, 그 URL 의
// latest*.yml 을 토큰 헤더로 폴링해 새 버전을 받아 설치한다. 파일이 없으면 조용히 비활성.
function configureUpdater() {
  try {
    const cfgPath = path.join(__dirname, 'updater-config.json');
    if (!fs.existsSync(cfgPath)) return;
    const { url, token } = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!url) return;
    autoUpdater.setFeedURL({ provider: 'generic', url });
    if (token) autoUpdater.requestHeaders = { Authorization: `Bearer ${token}` };
    autoUpdater.checkForUpdatesAndNotify();
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
