export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string; // ISO 8601
  // 이 메시지에 달린 이모지 리액션 (💡 = namory 저장됨, 그 외 사용자 추가)
  reactions?: string[];
};
