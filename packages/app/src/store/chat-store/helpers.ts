// 채팅 스토어 내부 헬퍼·시드·상수 — 순수 함수와 초기 대화방 정의.
// 슬라이스·persist 설정이 공유한다.
import { makeId } from '../../lib/id';
import type { Conversation } from './types';

// 현재 시각 ISO 문자열
export function now(): string {
  return new Date().toISOString();
}

// 첫 사용자 메시지로 대화방 제목 만들기(24자 초과면 말줄임)
export function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

// 빈 일반 채팅 대화방 생성
export function emptyConversation(): Conversation {
  const ts = now();
  return {
    id: makeId('c'),
    title: '새 대화',
    kind: 'chat',
    messages: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

// 시드: 첫 실행 시 보여줄 빈 대화방(저장된 대화가 있으면 persist 가 덮어쓴다).
// id 는 생성 id(`c_…`)·과거 카운터 id(`c0`)와 겹치지 않는 예약값으로 둔다 — 'c0' 면
// 서버에 남은 실제 대화 'c0' 의 툼스톤에 시드 방이 휩쓸려 사라질 수 있다.
// 하드코딩 ID 금지 — 서버 seed-chat 충돌 방지. 새 기기/초기화 시 고유 ID 생성.
export function makeSeedChat(): Conversation {
  const ts = new Date().toISOString();
  return { id: makeId('c'), title: '나비스와의 대화', kind: 'chat', messages: [], createdAt: ts, updatedAt: ts };
}

// 보고방 id 규칙 — 출처(sourceId)별 방. 크론마다 방 1개(sourceId=크론 id).
export const reportRoomId = (sourceId: string) => `report:${sourceId}`;

// 주간 다이제스트는 주기가 길어 비어 있어도 보이게 미리 시드. 크론·캘린더 방은
// 크론 목록(/api/crons)·첫 보고 도착 시 동적으로 생성된다.
export const REPORT_DIGEST: Conversation = {
  id: reportRoomId('digest'),
  title: '주간 다이제스트',
  kind: 'report',
  messages: [],
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
};
