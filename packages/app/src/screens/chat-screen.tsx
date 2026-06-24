import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatDrawer, ChatHeader, ChatInput, MessageList, ModelPicker } from '../components/chat';
import { PreviewPanel } from '../components/chat/preview-panel';
import { SidebarContent } from '../components/chat/sidebar-content';
import { LocalAgentSheet } from '../components/local-agent-sheet';
import {
  useActiveConversation,
  useIsActiveTyping,
  useTotalUnread,
} from '../store/chat-store';
import { useUiStore } from '../store/ui-store';
import { useReports } from '../hooks/use-reports';
import { useCrons } from '../hooks/use-crons';
import { ensureNotifyPermission } from '../lib/notify';
import { localAgent } from '../lib/local-agent';
import { CodeContextBar } from './chat-screen/code-context-bar';
import {
  CHAT_MAX_WIDTH,
  WIDE_BREAKPOINT,
  usePreviewAutodetect,
} from './chat-screen/use-preview-autodetect';

// 상태는 Zustand 스토어 / TanStack Query 훅에서 → 화면은 레이아웃 + 드로어 토글만
export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 코드 세션 설정 시트 + 닫힐 때 컨텍스트 바를 새로고침할 키.
  const [codeSheet, setCodeSheet] = useState(false);
  const [cfgKey, setCfgKey] = useState(0);
  const active = useActiveConversation();
  const totalUnread = useTotalUnread();
  // 활성 방이 생성(응답) 중인지 — 코드 바의 정지 버튼 노출용.
  const isActiveTyping = useIsActiveTyping();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  // 데스크톱 고정 사이드바는 접지 않았을 때만. 접으면 헤더 ☰ 로 다시 펼친다.
  const showSidebar = isWide && !sidebarCollapsed;

  // navis 선제 보고 폴링 → 보고방에 머지 + 크론 목록으로 보고방 미리 생성
  useReports();
  useCrons();
  // 대화 동기화는 App.tsx Root 로 올렸다(화면 무관 항상 마운트 — 백그라운드 핸드오프/복귀 pull 신뢰성).

  // 데스크톱/웹 알림 권한 요청(1회). 네이티브 모바일에선 no-op.
  useEffect(() => {
    ensureNotifyPermission();
  }, []);

  // 탭 상태는 저장하지 않으므로 항상 '채팅'으로 시작한다. 다만 저장돼 있던 활성 방이
  // 보고방이면 첫 진입 화면이 사이드바(채팅 탭)와 어긋난다 → 탭을 활성 방 종류에 맞춘다.
  const setChatTab = useUiStore((s) => s.setChatTab);
  useEffect(() => {
    if (active?.kind === 'report') setChatTab('report');
    else if (active?.kind === 'code') setChatTab('code');
    // 최초 마운트 시 1회만 — 이후 탭 전환은 사용자가 제어.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isReport = active?.kind === 'report';
  const isCode = active?.kind === 'code';

  // 코드 탭 미리보기 패널 상태. URL 은 에이전트 응답에서 localhost:PORT 자동 감지.
  const { previewOpen, setPreviewOpen, previewUrl, setPreviewUrl } = usePreviewAutodetect(
    isCode,
    active?.id,
  );

  return (
    <View className="flex-1 flex-row" style={{ paddingTop: insets.top }}>
      {/* 데스크톱: 고정 사이드바 (접기 가능) */}
      {showSidebar ? (
        <View className="w-[300px] border-r border-border bg-surface">
          <SidebarContent onCollapse={() => setSidebarCollapsed(true)} />
        </View>
      ) : null}

      {/* 채팅 컬럼 + (코드 탭) 오른쪽 미리보기 패널 */}
      <View className="flex-1 flex-row">
        <View className="flex-1" style={{ minWidth: 0 }}>
          <ChatHeader
            title={active?.title ?? '나비스'}
            subtitle={
              isReport
                ? '나비스 보고방 · 질문 가능'
                : isCode
                  ? '코드 · 내 맥 로컬 에이전트'
                  : '남운님의 개인 비서'
            }
            // 넓은 화면에선 ☰ 로 접힌 사이드바를 펼치고, 모바일에선 드로어를 연다.
            onMenu={() => (isWide ? setSidebarCollapsed(false) : setDrawerOpen(true))}
            unread={totalUnread}
            showMenu={!showSidebar}
            // 모델 선택은 코드 세션(=로컬 에이전트)에서만 숨긴다. 음성 대화모드 진입은
            // 하단 입력창(ChatInput)의 파형 버튼으로 옮겼다.
            right={!isCode ? <ModelPicker /> : undefined}
          />
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top}
          >
            {/* 미리보기 패널이 열렸을 땐 maxWidth 제한 없이 꽉 채운다 */}
            <View
              className="w-full flex-1 self-center"
              style={{ maxWidth: isCode && previewOpen ? undefined : CHAT_MAX_WIDTH }}
            >
              <MessageList />
              <View style={{ paddingBottom: insets.bottom }}>
                {/* 코드 세션: 폴더 칩 바(클로드 데스크톱 코드 느낌)를 입력창 바로 위에. */}
                {isCode ? (
                  <CodeContextBar
                    onOpenSettings={() => setCodeSheet(true)}
                    cfgKey={cfgKey}
                    generating={isActiveTyping}
                    onStop={() => localAgent?.stop()}
                    previewOpen={previewOpen}
                    onTogglePreview={() => setPreviewOpen((v) => !v)}
                  />
                ) : null}
                <ChatInput
                  placeholder={
                    isReport
                      ? '보고에 대해 질문하세요'
                      : isCode
                        ? '작업을 설명하거나 질문하세요'
                        : undefined
                  }
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>

        {/* 코드 탭 미리보기 패널 — 넓은 화면에서만, 토글 on 일 때 오른쪽에 나타남 */}
        {isCode && previewOpen && isWide ? (
          <View className="w-[480px] border-l border-border">
            <PreviewPanel
              url={previewUrl}
              onUrlChange={setPreviewUrl}
              onClose={() => setPreviewOpen(false)}
            />
          </View>
        ) : null}
      </View>

      {/* 모바일: 드로어 (넓은 화면에선 고정 사이드바라 불필요) */}
      {isWide ? null : <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />}

      {/* 코드 세션 설정(작업 폴더·토큰·쓰기 허용) — 닫히면 컨텍스트 바 새로고침 */}
      <LocalAgentSheet
        open={codeSheet}
        onClose={() => {
          setCodeSheet(false);
          setCfgKey((k) => k + 1);
        }}
      />
    </View>
  );
}
