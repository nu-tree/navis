// 코드 탭 미리보기 자동 감지 훅 + 레이아웃 상수.
// 가장 최근 어시스턴트 메시지에서 localhost URL 을 찾아 미리보기 패널을 자동으로 연다.
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../store/chat-store';

// 데스크톱/태블릿 폭 기준 — 이 이상이면 드로어 대신 고정 사이드바 + 중앙 채팅 칼럼.
export const WIDE_BREAKPOINT = 900;
// 넓은 화면에서 채팅 본문이 과도하게 늘어나지 않게 가독 폭 상한(Claude 데스크톱 느낌).
export const CHAT_MAX_WIDTH = 900;

// 코드 세션에서 최근 어시스턴트 메시지의 localhost URL 을 감지해 미리보기 패널 상태를 관리한다.
export function usePreviewAutodetect(isCode: boolean, activeId: string | undefined) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const conversations = useChatStore((s) => s.conversations);
  const lastUrlRef = useRef('');

  useEffect(() => {
    if (!isCode) return;
    const conv = conversations.find((c) => c.id === activeId);
    const msgs = conv?.messages ?? [];
    // 가장 최근 어시스턴트 메시지에서 localhost URL 을 찾아 미리보기 패널을 자동 열기.
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role !== 'assistant') continue;
      const match = msgs[i].text?.match(/https?:\/\/localhost(:\d+)?(\/[^\s)"'`]*)?/);
      if (match) {
        const found = match[0];
        if (found !== lastUrlRef.current) {
          lastUrlRef.current = found;
          setPreviewUrl(found);
          setPreviewOpen(true);
        }
        break;
      }
    }
  }, [conversations, activeId, isCode]);

  return { previewOpen, setPreviewOpen, previewUrl, setPreviewUrl };
}
