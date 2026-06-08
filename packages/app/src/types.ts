export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string; // ISO 8601
  // 이 메시지에 달린 이모지 리액션 (💡 = namory 저장됨, 그 외 사용자 추가)
  reactions?: string[];
  // 첨부 이미지 (표시용 로컬/원격 URI). 전송 시엔 base64 로 백엔드에 보낸다.
  images?: string[];
  // 이 응답 생성 중 사용한 도구 요약 목록 — 말풍선 상단 회색으로 표시.
  toolsUsed?: string[];
};
