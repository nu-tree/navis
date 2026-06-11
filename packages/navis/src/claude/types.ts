// 앱 첨부 이미지를 Claude에 넘길 때 쓰는 형태. data는 base64(접두사 없음).
// media_type은 Anthropic이 받는 4종으로 한정한다.
export interface InputImage {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data: string;
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
