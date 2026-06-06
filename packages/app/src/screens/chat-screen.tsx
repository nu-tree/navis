import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatDrawer, ChatHeader, ChatInput, MessageList, UpdateBanner } from '../components/chat';
import { SidebarContent } from '../components/chat/sidebar-content';
import { LocalAgentSheet } from '../components/local-agent-sheet';
import { Text } from '../components/ui/text';
import { useActiveConversation, useTotalUnread } from '../store/chat-store';
import { useUiStore } from '../store/ui-store';
import { useReports } from '../hooks/use-reports';
import { useCrons } from '../hooks/use-crons';
import { useConversationSync } from '../hooks/use-conversation-sync';
import { ensureNotifyPermission } from '../lib/notify';
import { localAgent, type LocalAgentConfig } from '../lib/local-agent';

// 코드 세션 상단 컨텍스트 바 — 작업 폴더·읽기/쓰기 모드 + 설정 열기. 설정이 덜 됐으면
// 무엇이 빠졌는지 안내한다. cfgKey 가 바뀌면(설정 시트 닫힘) 설정을 다시 읽는다.
function CodeContextBar({ onOpenSettings, cfgKey }: { onOpenSettings: () => void; cfgKey: number }) {
  const [cfg, setCfg] = useState<LocalAgentConfig | null>(null);
  useEffect(() => {
    if (!localAgent) return;
    let alive = true;
    localAgent.getConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, [cfgKey]);

  const ready = !!cfg && cfg.enabled && !!cfg.workdir && cfg.hasToken;
  const folder = cfg?.workdir ? cfg.workdir.split('/').filter(Boolean).pop() : null;
  const status = !cfg
    ? '확인 중…'
    : !cfg.enabled
      ? '로컬 에이전트 꺼짐 — 설정에서 켜기'
      : !cfg.workdir
        ? '작업 폴더 미설정'
        : !cfg.hasToken
          ? '토큰 미설정'
          : cfg.allowWrite
            ? '쓰기·터미널 허용'
            : '읽기 전용';

  return (
    <Pressable
      onPress={onOpenSettings}
      className="flex-row items-center gap-2 border-b border-border bg-surface px-4 py-2 cursor-pointer active:opacity-80 hover:bg-secondary"
    >
      <Text className="text-sm">{ready ? '📁' : '⚠️'}</Text>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-foreground">
          {folder ? folder : '코드 세션'}
          {ready ? <Text className="text-muted-foreground">{`  ·  ${status}`}</Text> : null}
        </Text>
        {!ready ? (
          <Text variant="caption" className="text-muted-foreground">
            {status}
          </Text>
        ) : null}
      </View>
      <Text className="text-muted-foreground">⚙️</Text>
    </Pressable>
  );
}

// 데스크톱/태블릿 폭 기준 — 이 이상이면 드로어 대신 고정 사이드바 + 중앙 채팅 칼럼.
const WIDE_BREAKPOINT = 900;
// 넓은 화면에서 채팅 본문이 과도하게 늘어나지 않게 가독 폭 상한(Claude 데스크톱 느낌).
const CHAT_MAX_WIDTH = 900;

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
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  // 데스크톱 고정 사이드바는 접지 않았을 때만. 접으면 헤더 ☰ 로 다시 펼친다.
  const showSidebar = isWide && !sidebarCollapsed;

  // navis 선제 보고 폴링 → 보고방에 머지 + 크론 목록으로 보고방 미리 생성
  useReports();
  useCrons();
  // 기기 간 대화 동기화(pull 주기 + 변경분 push)
  useConversationSync();

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

  return (
    <View className="flex-1 flex-row" style={{ paddingTop: insets.top }}>
      {/* 데스크톱: 고정 사이드바 (접기 가능) */}
      {showSidebar ? (
        <View className="w-[300px] border-r border-border bg-surface">
          <SidebarContent onCollapse={() => setSidebarCollapsed(true)} />
        </View>
      ) : null}

      <View className="flex-1">
        <ChatHeader
          title={active?.title ?? '나비스'}
          subtitle={
            isReport
              ? '보고 전용 · 읽기 전용'
              : isCode
                ? '코드 · 내 맥 로컬 에이전트'
                : '남운님의 개인 비서'
          }
          // 넓은 화면에선 ☰ 로 접힌 사이드바를 펼치고, 모바일에선 드로어를 연다.
          onMenu={() => (isWide ? setSidebarCollapsed(false) : setDrawerOpen(true))}
          unread={totalUnread}
          showMenu={!showSidebar}
        />
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top}
        >
          {/* 넓은 화면에선 본문을 가운데 정렬하고 폭을 제한 */}
          <View className="w-full flex-1 self-center" style={{ maxWidth: CHAT_MAX_WIDTH }}>
            {/* 코드 세션: 작업 폴더·모드 컨텍스트 바 (클로드 데스크톱 코드 느낌) */}
            {isCode ? (
              <CodeContextBar onOpenSettings={() => setCodeSheet(true)} cfgKey={cfgKey} />
            ) : null}
            <MessageList />
            {/* 데스크톱 업데이트 알림(클로드코드 스타일). 데스크톱 외 환경에선 자동 숨김. */}
            <UpdateBanner />
            {isReport ? (
              <View
                className="border-t border-border bg-background px-4 py-3"
                style={{ paddingBottom: insets.bottom + 12 }}
              >
                <Text variant="caption" className="text-center text-muted-foreground">
                  나비스가 보내는 보고가 모이는 방이야 · 여기선 답장하지 않아도 돼
                </Text>
              </View>
            ) : (
              <View style={{ paddingBottom: insets.bottom }}>
                <ChatInput />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
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
