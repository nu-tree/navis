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

## 다운로드 페이지 + 자동 업데이트 (navis/Railway 호스팅)

GitHub Releases/PAT 를 쓰지 않는다. 설치파일은 **이미 떠 있는 navis(Railway)**
가 직접 호스팅하고, **토큰 로그인** 뒤에서 받는다. 빌드만 GitHub Actions(맥/윈도우
러너)가 하고 — Railway 는 리눅스라 .dmg/.exe 를 빌드할 수 없음 — 산출물을 navis 로
업로드한다.

```
GitHub Actions(맥/윈도우 빌드) ──업로드──▶ navis (Railway, 볼륨 보관)
                                              ↓
              다운로드: https://<navis-url>/download  (토큰 로그인)
              자동 업데이트: 설치 앱이 generic provider 로 같은 navis 를 확인
```

새 엔드포인트(navis):
- `GET  /download` — 토큰 로그인 후 설치파일 다운로드 페이지
- `PUT  /api/desktop/upload?name=<파일>` — Actions 가 산출물 업로드(Bearer 토큰)
- `GET  /api/desktop/file/<파일>` — 설치파일/`latest*.yml` 서빙(사람=`?token=`, 업데이터=Bearer)

인증은 전부 navis 의 `APP_API_TOKEN`(= 앱의 `EXPO_PUBLIC_NAVIS_TOKEN`) 하나로 통일.

### 한 번만 셋업
1. **Railway 볼륨**: navis 서비스에 볼륨을 붙이고 마운트 경로를 정한 뒤,
   변수 `DESKTOP_DIR` 에 그 경로(예: `/data/desktop`)를 넣는다. (볼륨이 아니면
   재배포 때 설치파일이 사라짐.)
2. **소스 레포(navis) Secrets → Actions** 에 다음 둘이 있어야 한다(이미 있으면 끝):
   - `EXPO_PUBLIC_NAVIS_URL`   — navis 베이스 URL (예: `https://navis.up.railway.app`)
   - `EXPO_PUBLIC_NAVIS_TOKEN` — navis `APP_API_TOKEN` 과 같은 값
   → fine-grained PAT / public 레포는 **더 이상 필요 없음**(`RELEASES_TOKEN` 삭제 가능).
3. **macOS 자가서명 인증서**(자동 업데이트 필수, 무료): macOS 자동설치(Squirrel.Mac)는
   "설치된 앱 == 새 버전"의 코드서명 신원이 일치해야만 교체한다. 미서명/ad-hoc 은 빌드마다
   신원이 달라 거부 → 수동 다운로드로 폴백. 유료 Developer 인증서 없이 **자가서명 인증서**로
   해결한다(최초 설치 시 우클릭→열기 1회만, 이후 업데이트는 완전 자동).
   ```bash
   bash packages/desktop/scripts/make-selfsigned-cert.sh
   ```
   → 출력 안내대로 레포 Secret 2개 등록: `MAC_CSC_LINK`(p12 base64), `MAC_CSC_KEY_PASSWORD`.
   (Secret 이 없으면 mac 은 미서명으로 빌드돼 자동설치가 안 됨. Windows 는 미서명도 자동설치 OK.)

### 릴리스 (이후 매번)
```bash
# packages/desktop/package.json 의 version 올린 뒤
git tag desktop-v0.2.0 && git push --tags     # → Actions 빌드 후 navis 로 업로드
```
또는 GitHub Actions 탭에서 **desktop release → Run workflow** 수동 실행.

- 설치된 앱: 실행 시 navis 의 `latest*.yml` 확인 → 새 버전 자동 다운로드/적용.
- 단, 자동 업데이트가 켜지려면 **현재 깔린 버전이 이미 navis 를 보도록 빌드돼 있어야**
  한다(updater-config.json 이 구워진 빌드). 기존 GitHub Releases 버전이 깔려 있다면
  **한 번만 새 빌드를 수동 설치**하고, 이후부터 자동.

### 로컬에서 직접 빌드+업로드(선택)
```bash
cd packages/desktop
node -e "require('fs').writeFileSync('updater-config.json',JSON.stringify({url:process.env.EXPO_PUBLIC_NAVIS_URL+'/api/desktop/file',token:process.env.EXPO_PUBLIC_NAVIS_TOKEN}))"
pnpm web:build && npx electron-builder --mac --publish never   # 맥은 .dmg 만
NAVIS_URL=$EXPO_PUBLIC_NAVIS_URL NAVIS_TOKEN=$EXPO_PUBLIC_NAVIS_TOKEN node scripts/upload.mjs
```

## 구조
- `electron-main.cjs` — web-build 를 로컬 HTTP 서버로 서빙 후 BrowserWindow 로드,
  프로덕션에서 electron-updater 로 자동 업데이트 확인
- `preload.cjs` — 렌더러 ↔ 메인 브리지 자리 (향후 네이티브 알림/딥링크)
- `web:build` 스크립트 — `expo export -p web` 결과를 `web-build/` 로 출력
