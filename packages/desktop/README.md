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

## 다운로드 페이지 + 자동 업데이트 (public 릴리스 레포)

소스 레포(`nu-tree/navis`)는 private 이라 설치파일을 **public 릴리스 전용 레포
`nu-tree/navis-desktop`** 에 게시한다. 이러면 누구나 로그인 없이 다운로드 가능하고
앱 자동 업데이트도 토큰 없이 동작한다.

```
nu-tree/navis (private 소스) ──CI 빌드──▶ nu-tree/navis-desktop (public 릴리스)
                                              ↓
              다운로드: github.com/nu-tree/navis-desktop/releases/latest
              자동 업데이트: 설치 앱이 같은 곳을 확인
```

### 한 번만 셋업
1. GitHub 에 **public 레포 `navis-desktop`** 생성(비어 있어도 됨)
2. fine-grained PAT 발급 — `navis-desktop` 레포에 **Contents: write**
3. 소스 레포(navis) Settings → Secrets → Actions 에 `RELEASES_TOKEN` 으로 추가

### 릴리스 (이후 매번)
```bash
# packages/desktop/package.json 의 version 올린 뒤
git tag desktop-v0.2.0 && git push --tags     # → Actions 가 맥/윈도우 빌드+게시
```
또는 GitHub Actions 탭에서 **desktop release → Run workflow** 수동 실행.

- 설치된 앱: 실행 시 `autoUpdater.checkForUpdatesAndNotify()` → 새 버전 자동 적용.
- 즉 데스크톱은 **매번 수동 재설치 불필요** — 태그 한 번이면 사용자 앱이 알아서 갱신.

### 로컬에서 직접 게시(선택)
```bash
cd packages/desktop
export GH_TOKEN=<navis-desktop Contents:write PAT>
pnpm release
```

## 구조
- `electron-main.cjs` — web-build 를 로컬 HTTP 서버로 서빙 후 BrowserWindow 로드,
  프로덕션에서 electron-updater 로 자동 업데이트 확인
- `preload.cjs` — 렌더러 ↔ 메인 브리지 자리 (향후 네이티브 알림/딥링크)
- `web:build` 스크립트 — `expo export -p web` 결과를 `web-build/` 로 출력
