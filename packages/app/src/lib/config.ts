// navis 백엔드 접속 설정. Expo 는 EXPO_PUBLIC_* 환경변수를 번들에 인라인한다.
// 값은 packages/app/.env 에 둔다 (예시는 .env.example 참고).
//   EXPO_PUBLIC_NAVIS_URL=https://<navis>.up.railway.app
//   EXPO_PUBLIC_NAVIS_TOKEN=<navis 의 APP_API_TOKEN 과 동일 값>
// 미설정이면 목업 응답으로 폴백 (백엔드 없이도 앱이 돌아감).
export const NAVIS_URL = (process.env.EXPO_PUBLIC_NAVIS_URL ?? '').replace(/\/$/, '');
export const NAVIS_TOKEN = process.env.EXPO_PUBLIC_NAVIS_TOKEN ?? '';
export const IS_BACKEND_CONFIGURED = NAVIS_URL.length > 0 && NAVIS_TOKEN.length > 0;
