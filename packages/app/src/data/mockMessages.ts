import type { ChatMessage } from '../types';

// 백엔드 연결 전 화면 확인용 가짜 대화
export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    role: 'assistant',
    text: '안녕, navis야. 오늘 뭐 도와줄까?',
    createdAt: '2026-06-04T09:00:00.000Z',
  },
  {
    id: 'm2',
    role: 'user',
    text: '내 투두 확인해줘',
    createdAt: '2026-06-04T09:00:20.000Z',
  },
  {
    id: 'm3',
    role: 'assistant',
    text: '미완료 12개 있어. 이직 준비, 포트폴리오 마무리, 뚜비몰 리뉴얼이 제일 위에 있어.',
    createdAt: '2026-06-04T09:00:25.000Z',
  },
  {
    id: 'm4',
    role: 'user',
    text: '댄스학원은 안 하기로 했어',
    createdAt: '2026-06-04T09:01:00.000Z',
  },
  {
    id: 'm5',
    role: 'assistant',
    text: '오케이, 댄스학원 투두는 취소로 닫아뒀어.',
    createdAt: '2026-06-04T09:01:03.000Z',
  },
];
