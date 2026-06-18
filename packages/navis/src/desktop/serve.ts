// 데스크톱 설치파일 배포 — GitHub Releases/PAT 없이 Railway(navis)가 직접 호스팅한다.
//
// 파이프라인:
//   1) GitHub Actions(맥/윈도우)가 .dmg/.exe + latest*.yml 를 빌드 →
//      PUT /api/desktop/upload?name=<파일> (Bearer 토큰) 로 이 서버에 올린다.
//   2) 파일은 config.desktopDir(= Railway 볼륨)에 저장된다.
//   3) 사람은 GET /download 에서 토큰 로그인 후 .dmg/.exe 를 받는다.
//   4) 설치된 앱의 electron-updater 는 generic provider 로 /api/desktop/file/latest*.yml
//      과 설치파일을 폴링해 자동 업데이트한다(요청 헤더에 Bearer 토큰).
//
// 인증은 navis 의 기존 APP_API_TOKEN(config.appApiToken)을 그대로 재사용한다.
// 토큰은 Authorization: Bearer 헤더 또는 ?token= 쿼리(브라우저 다운로드 링크용)로 받는다.
//
// 이 파일은 책임별 모듈(serve/*)을 묶어 다시 내보내는 얇은 barrel 이다.
// 외부 import 경로(../desktop/serve.js)를 유지하기 위해 존재한다.
export { handleDesktopUpload } from "./serve/upload.js";
export { handleDesktopList, handleDesktopLatest } from "./serve/list.js";
export { handleDesktopPrune } from "./serve/prune.js";
export { handleDesktopFile } from "./serve/file.js";
export { handleDownloadPage } from "./serve/page.js";
