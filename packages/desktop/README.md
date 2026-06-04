# navis-desktop

navis 데스크톱 앱 (Electron). `packages/app` 의 RN 컴포넌트를 react-native-web 으로
빌드해 데스크톱 창에 띄운다. macOS `.dmg` / Windows `.exe` 설치파일을 만든다.

## 개발 실행
```bash
# 1) 터미널 A — Expo 웹 dev 서버
pnpm --filter navis-app web
# 2) 터미널 B — Electron(dev 서버 로드)
pnpm --filter navis-desktop dev
```

## 설치파일 빌드 (배포)
백엔드 주소는 `packages/app/.env` 의 EXPO_PUBLIC_NAVIS_* 를 빌드 시 인라인한다.

```bash
# macOS (.dmg) — macOS 에서 실행
pnpm --filter navis-desktop dist:mac

# Windows (.exe/nsis) — Windows 에서 실행 권장
#   (macOS 에서 크로스 빌드하려면 wine 등 추가 도구 필요)
pnpm --filter navis-desktop dist:win
```
결과물은 `packages/desktop/release/` 에 생성된다.

## 구조
- `electron-main.cjs` — web-build 를 로컬 HTTP 서버로 서빙 후 BrowserWindow 로드
- `preload.cjs` — 렌더러 ↔ 메인 브리지 자리 (향후 네이티브 알림/딥링크)
- `web:build` 스크립트 — `expo export -p web` 결과를 `web-build/` 로 출력
