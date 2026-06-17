// 환경변수 로딩 + 검증. 누락 시 즉시 죽어서 잘못된 설정으로 떠 있는 걸 막는다.
//
// env 파일 자동 로드 — 본 모듈이 평가되기 직전에 실행돼 process.env를 채운 뒤
// required()/optional() 검증이 동작한다. 우선순위:
//   1) 현재 디렉터리의 .env  (개발용)
//   2) ~/.config/navis/env    (글로벌 설치용 — XDG 표준)
//   3) 이미 export 된 process.env (가장 마지막에 우선 — Railway 등 호스팅 환경)
// Node 21.7+ 의 process.loadEnvFile()을 사용 — 별도 dotenv 의존성 불필요.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

(function loadEnvFiles(): void {
  const candidates = [
    join(process.cwd(), ".env"),
    join(homedir(), ".config", "navis", "env"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        process.loadEnvFile(path);
        return; // 첫 번째로 찾은 파일만 로드(우선순위 보존)
      } catch (err) {
        console.error(`[config] env 파일 로드 실패: ${path}`, err);
      }
    }
  }
})();

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] 필수 환경변수 누락: ${name}`);
    process.exit(1);
  }
  return v;
}

// 선택적 환경변수. 없으면 undefined를 돌려주고 죽지 않는다.
// (구글 캘린더처럼 토큰이 채워졌을 때만 붙이는 부가 연동에 쓴다.)
function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

// URL+토큰이 한 쌍으로 다 있을 때만 외부 MCP 연동 설정을 돌려준다.
// 한쪽만 채워져 있으면 설정 실수로 보고 경고 후 무시 → 반쪽짜리 연결로 뜨는 걸 막는다.
function optionalMcp(
  label: string,
  urlVar: string,
  tokenVar: string,
): { url: string; token: string } | undefined {
  const url = optional(urlVar);
  const token = optional(tokenVar);
  if (!url && !token) return undefined;
  if (!url || !token) {
    console.warn(
      `[config] ${label} 연동 무시: ${urlVar}/${tokenVar} 둘 다 필요한데 하나만 설정됨.`,
    );
    return undefined;
  }
  return { url, token };
}

// 구글 OAuth 3개 (client_id + secret + refresh_token) 가 다 채워졌을 때만 인증 설정을
// 돌려준다. 하나라도 비면 캘린더 비활성. 부분 설정 시 한 줄 경고.
function optionalGoogleAuth():
  | { clientId: string; clientSecret: string; refreshToken: string }
  | undefined {
  const clientId = optional("GOOGLE_CLIENT_ID");
  const clientSecret = optional("GOOGLE_CLIENT_SECRET");
  const refreshToken = optional("GOOGLE_REFRESH_TOKEN");
  if (!clientId && !clientSecret && !refreshToken) return undefined;
  if (!clientId || !clientSecret || !refreshToken) {
    console.warn(
      "[config] google 캘린더 비활성: GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN 셋 다 필요한데 일부만 설정됨.",
    );
    return undefined;
  }
  return { clientId, clientSecret, refreshToken };
}

// ntfy 푸시(모바일 알림 대체). NTFY_TOPIC 이 있을 때만 활성 — 무료 Apple 계정이라 APNs
// 자체 푸시가 안 되는 navis-app 대신, ntfy 앱이 푸시를 받아준다(데스크톱은 영향 없음).
// URL 은 미설정 시 공개 인스턴스(https://ntfy.sh). 토픽명은 추측 불가한 랜덤 문자열을 쓸 것
// (공개 인스턴스는 토픽명을 아는 사람이 구독 가능 → 랜덤명이 사실상의 접근 제어).
function optionalNtfy(): { url: string; topic: string } | undefined {
  const topic = optional("NTFY_TOPIC");
  if (!topic) return undefined;
  const url = optional("NTFY_URL") ?? "https://ntfy.sh";
  return { url: url.replace(/\/+$/, ""), topic };
}

export const config = {
  // Claude Code 구독 OAuth 토큰. SDK가 process.env에서 자동으로 읽으므로
  // 여기선 존재 여부만 검증한다 (없으면 인증 실패로 모든 호출이 깨짐).
  // `claude setup-token` 으로 발급.
  claudeOauthToken: required("CLAUDE_CODE_OAUTH_TOKEN"),

  // namory MCP 서버 접속 (navis가 namory를 외부 서비스처럼 도구로 호출).
  // 로컬: http://localhost:3000/mcp, Railway 내부망: http://namory.railway.internal:PORT/mcp
  namoryMcpUrl: required("NAMORY_MCP_URL"),
  // namory 엔드포인트 보호 토큰 (namory의 NAMORY_TOKEN과 동일 값).
  namoryToken: required("NAMORY_TOKEN"),

  // 모델 — 메인 응답·검토는 Opus 4.8(최고 품질), 사후 큐레이터만 경량 Haiku(아래).
  // 운영 튜닝 상수 — 바꾸려면 코드 수정(보안·환경 무관 값은 env로 빼지 않는다).
  // 참고: 앱 채팅의 기본 모델은 클라이언트(packages/app, DEFAULT_MODEL=Sonnet 4.6)가
  // body.model 로 보내고, 서버는 selectableModels 화이트리스트로만 검증한다. config.model
  // 은 모델 미지정 경로(크론 보고·다이제스트·CLI)의 폴백이다.
  model: "claude-opus-4-8",
  // 큐레이터(사후 저장 판단) — 매 턴이 끝난 뒤 백그라운드로 한 번 더 도는 "그물"이다.
  // 작은 인스턴스(Railway hobby)에선 이 호출이 메인 응답·바로 이어지는 다음 턴과
  // CPU/동시성을 다퉈 체감 지연을 키운다. 저장 여부 판단은 가벼운 작업이므로 경량
  // Haiku 로 둬 자원 점유·생성 시간을 최소화한다(속도·응답성 우선). 품질이 필요한
  // 핵심 저장은 메인 턴의 save 너지가 이미 받쳐주므로 손실이 거의 없다.
  curatorModel: "claude-haiku-4-5-20251001",
  reviewModel: process.env.NAVIS_REVIEW_MODEL ?? "claude-opus-4-8",

  // 앱에서 사용자가 고를 수 있는 모델 화이트리스트(클로드 데스크톱식 모델 선택).
  // /api/chat 의 body.model 은 이 목록에 있을 때만 적용하고, 아니면 config.model(기본
  // Opus 4.8)로 폴백한다 — 임의 모델 문자열 주입 방지. 첫 항목이 사실상의 기본값.
  selectableModels: [
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ] as readonly string[],

  // 대화 맥락 유지 한도(토큰). 한 대화의 컨텍스트가 이걸 넘으면 다음 메시지부터
  // 새 세션으로 리셋하고 사용자에게 알린다. 잊힌 맥락은 namory가 받쳐줌.
  // 기본 150k = opus 200k 창의 75%. 모델 한계·SDK 자동압축 전에 우리가 제어.
  contextTokenLimit: 150_000,

  // 자기 소스 조회용 GitHub 레포. navis가 대화 중 read_repo_file/list_repo_files
  // 도구로 자기 코드를 보여줄 수 있게 한다. 컨테이너엔 src/가 없어서(dist만 복사)
  // GitHub Contents API 경유가 유일한 경로.
  //   GITHUB_REPO: "owner/repo" 형태 (예: nu-tree/namory). 미설정이면 도구가 친절한 에러.
  //   GITHUB_TOKEN: 선택. private 레포면 필수, public이어도 있으면 rate limit 60→5000/h.
  githubRepo: optional("GITHUB_REPO"),
  githubToken: optional("GITHUB_TOKEN"),
  // self-improve PR 생성 webhook 검증용 HMAC secret. GitHub repo Settings → Webhooks
  // 등록 시 같은 값을 secret 으로 박는다. 미설정이면 webhook 라우트가 모든 요청을 거부.
  githubWebhookSecret: optional("GITHUB_WEBHOOK_SECRET"),

  // 구글 캘린더 OAuth (refresh token 방식, 영구).
  // 셋 다 채워져야 캘린더 도구·스케줄러가 활성화됨. 미설정이면 조용히 비활성.
  // 발급: Google Cloud Console OAuth 동의 화면(테스트 모드) → Web app 클라이언트 →
  // OAuth Playground 에서 refresh_token 1회 발급(README 참조).
  google: optionalGoogleAuth(),

  // 주간 기억 다이제스트: navis가 정기적으로 최근 기억을 요약해 자기이해 프로필에
  // 반영하고(자동 압축), 요약을 앱 보고로 기록한다. namory의 수동 profile_update
  // 누락을 메우는 자동화. 이 경로에서만 profile_update를 허용(대화 경로는 계속 차단).
  // 스케줄·기간은 운영 튜닝이라 코드 상수.
  digestSchedule: "0 9 * * 1", // 월요일 09시 KST
  digestTimezone: "Asia/Seoul",
  digestDays: 7, // 요약 대상 기간(일) — 지난 한 주

  // 봇 성격·행동 지침의 "초기/폴백" 값. 이제 1순위는 namory(DB)의 settings.system_prompt
  // (앱 설정에서 편집·navis 가 직접 갱신). env 는 DB 가 비었을 때의 폴백, 없으면 내장 기본값.
  // → 더 이상 필수 아님(system-prompt.ts 의 getSystemPrompt 가 우선순위 처리).
  systemPrompt: optional("SYSTEM_PROMPT"),

  // 모바일/데스크톱 앱(navis-app)이 /api/chat 을 호출할 때 쓰는 인증 토큰.
  // 미설정이면 /api/chat 라우트가 비활성(503). 앱의 EXPO_PUBLIC_NAVIS_TOKEN 과 동일 값.
  appApiToken: optional("APP_API_TOKEN"),

  // ntfy 푸시 대상(모바일 알림). NTFY_TOPIC 설정 시 모든 선제 보고를 폰 ntfy 앱으로 푸시.
  ntfy: optionalNtfy(),

  // 데스크톱 설치파일(.dmg/.exe + latest*.yml)을 보관/서빙할 디렉터리.
  // Railway 볼륨을 마운트한 경로를 넣는다(예: /data/desktop). 재배포에도 유지되려면
  // 반드시 볼륨이어야 한다. 미설정이면 인스턴스 임시 디스크(.desktop-dist) — 재배포 시 사라짐.
  desktopDir: optional("DESKTOP_DIR") ?? ".desktop-dist",

  // iOS 사이드로드 배포(.ipa + 아이콘)를 보관/서빙할 디렉터리.
  // SideStore 가 source 피드(/api/ios/source.json)와 .ipa 를 폴링해 자동 재서명·업데이트한다.
  // 데스크톱과 동일하게 Railway 볼륨 경로를 권장(미설정이면 재배포 시 사라지는 임시 디스크).
  iosDir: optional("IOS_DIR") ?? ".ios-dist",

  // HTTP 포트 — 앱 API(/api/*) + 헬스체크(/health) + webhook + 데스크톱 배포.
  port: Number(process.env.PORT) || 3000,

  // navis 백엔드의 공개 URL(예: https://navis.up.railway.app). 커넥터 OAuth 의
  // redirect_uri 를 만들 때 쓴다 — 제공자(구글/노션 등)에 등록한 콜백과 정확히 일치해야 함.
  // 미설정이면 OAuth 시작이 에러(정적 키 커넥터는 영향 없음). 끝의 슬래시는 제거.
  publicUrl: (optional("NAVIS_PUBLIC_URL") ?? "").replace(/\/+$/, "") || undefined,
} as const;
