// 대화 목록 헬퍼 — 방 종류 판별, lead 아이콘, 표시 제목/미리보기 등 순수 함수 모음.
// (UI 컴포넌트가 아닌, 렌더에 쓰이는 파생 값 계산 전용)
import type { IconName } from '../../ui/icon';
import type { Conversation } from '../../../store/chat-store';

// 드래그 정렬 슬롯 높이(행 1개분). DraggableRows 의 index 계산에 쓰임.
export const ROW_HEIGHT = 58;

// 보고방 중 "크론" 방 판별 — 빌트인 다이제스트/캘린더 외엔 크론(sourceId=크론 id).
const BUILTIN_REPORT_IDS = new Set(['report:digest', 'report:calendar']);
export const isCronRoom = (c: Conversation) =>
  c.kind === 'report' && c.id.startsWith('report:') && !BUILTIN_REPORT_IDS.has(c.id);
export const cronIdOf = (c: Conversation) => c.id.slice('report:'.length);

// 방 종류별 앞 아이콘 — 예전에 제목 앞에 붙던 이모지(📋/⏰/📅) 역할을 대체한다.
export function roomIcon(conv: Conversation): IconName | null {
  if (conv.kind === 'code') return 'terminal';
  if (conv.kind !== 'report') return null;
  if (conv.id === 'report:digest') return 'file-text';
  if (conv.id === 'report:calendar') return 'calendar';
  return 'clock'; // 크론 보고방
}

// 서버가 준 제목 앞에 이모지(⏰/📋/📅 등)가 남아 있을 수 있어, lead 아이콘과 겹치지
// 않게 표시에서만 떼어낸다. Hermes 안전을 위해 \p 이스케이프 없이, BMP 기호 범위 +
// 이모지 서러게이트 쌍 + 변이 선택자(FE0F)로 매칭한다(뒤따르는 공백까지 포함).
const LEAD_EMOJI =
  /^(?:[←-⇿⌀-➿⬀-⯿️]|[\uD800-\uDBFF][\uDC00-\uDFFF])+\s*/;
export const displayTitle = (conv: Conversation): string =>
  roomIcon(conv) ? conv.title.replace(LEAD_EMOJI, '') : conv.title;

export function preview(conv: Conversation): string {
  const last = conv.messages[conv.messages.length - 1];
  if (!last) {
    if (conv.kind === 'report') return '아직 보고가 없어';
    if (conv.kind === 'code') return '내 맥에서 코딩 시작';
    return '새 대화';
  }
  return last.text.replace(/\s+/g, ' ').slice(0, 38);
}
