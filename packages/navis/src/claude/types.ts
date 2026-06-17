// 앱 첨부 이미지를 Claude에 넘길 때 쓰는 형태. data는 base64(접두사 없음).
// media_type은 Anthropic이 받는 4종으로 한정한다.
export interface InputImage {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data: string;
}

// askClaude 호출 옵션. 위치 인자 13개를 옵션 객체로 묶어 호출부 가독성과 안전성을
// 높이고, 새 필드 추가 시 시그니처 깨짐을 막는다.
//   prompt: 사용자 메시지(필수).
//   resumeSessionId: 이전 SDK 세션 id. 있으면 그 대화를 이어받는다(멀티턴).
//   images: 첨부 이미지(콘드 경로만 사용).
//   allowProfileUpdate: 신뢰된 자동화(주간 다이제스트)에서만 true. 사용자 대화 경로는 false.
//   projectContext: CLI 에서 감지된 프로젝트명. save 호출에 project 태그 자동 부착.
//   historyContext: 새 세션 첫 턴에 채널 직전 메시지들을 텍스트로 묶어 넘기는 맥락 보강.
//   onTextDelta / onThinkingDelta: 토큰 단위 스트리밍 콜백(앱 SSE).
//   onStatus: 도구 호출 시작 시 콜백(typing indicator 용 기본 레이블).
//   onToolComplete: 도구 인풋이 확정된 시점 콜백(말풍선 한 줄 추가).
//   modelOverride: 호출부가 화이트리스트(config.selectableModels)로 검증한 값만 넘긴다.
//   abortController: 중지 전파(클라 중지 버튼 → SDK query 생성 실제 중단).
export interface AskClaudeOptions {
  prompt: string;
  resumeSessionId?: string;
  images?: InputImage[];
  allowProfileUpdate?: boolean;
  projectContext?: string;
  historyContext?: string;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onStatus?: (toolName: string) => void;
  onToolComplete?: (label: string) => void;
  modelOverride?: string;
  abortController?: AbortController;
}

export interface AskResult {
  text: string;
  // 이 대화의 세션 id. 다음 메시지에서 resume 으로 넘기면 맥락이 이어진다.
  sessionId: string;
  // 직전 턴의 입력 컨텍스트 토큰 수. 이게 임계를 넘으면 다음 대화는 새 세션으로 리셋.
  contextTokens: number;
  // 이번 턴에 namory에 새 기억을 저장했는지. 앱에서 💡 리액션 표시에 쓴다.
  saved: boolean;
  // 이번 턴에 사용된 도구 요약 목록 (앱 말풍선 표시용)
  toolsUsed: string[];
  // 지연 계측(ms). 채팅 응답 속도 진단용 — 어디서 시간이 새는지 분해한다.
  //   prefetchMs:  query 시작 전 사전 준비(커넥터/시스템프롬프트/프로젝트목록, 병렬·대부분 캐시)
  //   firstMsgMs:  query() 시작 → SDK 첫 메시지까지(CLI 스폰 + MCP 핸드셰이크 바닥)
  //   totalMs:     askClaude 전체 소요
  timing?: { prefetchMs: number; firstMsgMs: number; totalMs: number };
}
