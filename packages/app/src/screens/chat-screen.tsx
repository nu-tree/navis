import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatDrawer, ChatHeader, ChatInput, MessageList, ModelPicker } from '../components/chat';
import { PreviewPanel } from '../components/chat/preview-panel';
import { BranchPicker } from '../components/chat/branch-picker';
import { SidebarContent } from '../components/chat/sidebar-content';
import { LocalAgentSheet } from '../components/local-agent-sheet';
import { Text } from '../components/ui/text';
import { Icon } from '../components/ui/icon';
import { Button } from '../components/ui/button';
import {
  useActiveConversation,
  useIsActiveTyping,
  useTotalUnread,
  useChatStore,
} from '../store/chat-store';
import { useUiStore } from '../store/ui-store';
import { useReports } from '../hooks/use-reports';
import { useCrons } from '../hooks/use-crons';
import { useConversationSync } from '../hooks/use-conversation-sync';
import { ensureNotifyPermission } from '../lib/notify';
import { localAgent } from '../lib/local-agent';

// 코드 세션 폴더 칩 바 — 클로드 데스크톱 코드 느낌. [🖥 로컬] · [📁 폴더(=namory 프로젝트)]
// · [＋폴더] · (토큰 경고 / 정지 / ⚙️). 입력창 바로 위에 둔다. 폴더는 "세션별"이라
// active 대화의 workdir/project 를 쓰고, ＋폴더로 네이티브 다이얼로그를 열어 바꾼다.
// 폴더를 고르면 그 레포의 namory 프로젝트 기억이 연결되고(없으면 자동 생성) cwd 도 바뀐다.
function CodeContextBar({
  onOpenSettings,
  cfgKey,
  generating,
  onStop,
  previewOpen,
  onTogglePreview,
}: {
  onOpenSettings: () => void;
  cfgKey: number;
  generating: boolean;
  onStop: () => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
}) {
  const active = useActiveConversation();
  const setCodeFolder = useChatStore((s) => s.setCodeFolder);
  const setCodeBranch = useChatStore((s) => s.setCodeBranch);
  const [hasToken, setHasToken] = useState(true);
  const [allowWrite, setAllowWrite] = useState(false);
  useEffect(() => {
    if (!localAgent) return;
    let alive = true;
    localAgent.getConfig().then((c) => {
      if (!alive) return;
      setHasToken(c.hasToken);
      setAllowWrite(c.allowWrite);
    });
    return () => {
      alive = false;
    };
  }, [cfgKey]);

  const folderName =
    active?.project || active?.workdir?.split('/').filter(Boolean).pop() || null;

  const pickFolder = async () => {
    if (!localAgent || !active) return;
    const r = await localAgent.pickFolder();
    if (r) setCodeFolder(active.id, r.workdir, r.project);
  };

  return (
    <View className="flex-row items-center gap-2 px-3 pb-2 pt-1">
      {/* 항상 로컬 — 코드는 내 맥에서 돈다(별도 토글 없음). */}
      <View className="flex-row items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-1.5">
        <Icon name="monitor" size={13} tone="foreground" />
        <Text className="text-xs font-medium text-foreground">로컬</Text>
      </View>
      {/* 폴더(=namory 프로젝트) 칩 — 누르면 폴더 선택. 기억은 이 폴더로 자동 연결/생성. */}
      <Pressable
        onPress={pickFolder}
        className="flex-row items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
      >
        <Icon name="folder" size={13} tone="foreground" />
        <Text numberOfLines={1} className="max-w-[180px] text-xs font-medium text-foreground">
          {folderName ?? '폴더 선택'}
        </Text>
        {folderName && allowWrite ? (
          <Text className="text-[10px] text-muted-foreground">· 쓰기</Text>
        ) : null}
      </Pressable>
      {/* 폴더 바꾸기 */}
      <Pressable
        onPress={pickFolder}
        hitSlop={6}
        className="flex-row items-center gap-1 rounded-lg border border-border px-2 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
      >
        <Icon name="plus" size={13} tone="muted-foreground" />
        <Text className="text-xs text-muted-foreground">폴더</Text>
      </Pressable>

      {/* 브랜치 칩 — 폴더가 선택돼 있을 때만. git 저장소가 아니면 시트에서 안내. */}
      {active?.workdir ? (
        <BranchPicker
          workdir={active.workdir}
          branch={active.branch}
          onChange={(b) => setCodeBranch(active.id, b)}
        />
      ) : null}

      <View className="flex-1" />

      {/* 미리보기 패널 토글 */}
      <Pressable
        onPress={onTogglePreview}
        hitSlop={6}
        className={`flex-row items-center gap-1 rounded-lg border px-2 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary ${previewOpen ? 'border-primary bg-primary/10' : 'border-border'}`}
      >
        <Icon name="globe" size={13} tone={previewOpen ? 'primary' : 'muted-foreground'} />
        <Text className={`text-xs font-medium ${previewOpen ? 'text-primary' : 'text-muted-foreground'}`}>
          미리보기
        </Text>
      </Pressable>

      {/* 토큰 없으면 경고(설정), 생성 중이면 정지, 아니면 ⚙️ 설정. */}
      {!hasToken ? (
        <Pressable
          onPress={onOpenSettings}
          hitSlop={6}
          className="flex-row items-center gap-1 rounded-lg border border-border px-2 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
        >
          <Icon name="alert-triangle" size={13} tone="muted-foreground" />
          <Text className="text-xs text-muted-foreground">토큰</Text>
        </Pressable>
      ) : generating ? (
        // 채팅 입력창의 중지 버튼과 동일한 모양(둥근 secondary + 빨간 호버).
        <Button
          size="icon"
          variant="secondary"
          className="rounded-full transition-colors hover:bg-destructive/20 active:bg-destructive/30"
          onPress={onStop}
        >
          <Icon name="square" size={16} tone="foreground" />
        </Button>
      ) : (
        <Pressable
          onPress={onOpenSettings}
          hitSlop={6}
          className="rounded-lg px-1.5 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
        >
          <Icon name="settings" size={15} tone="muted-foreground" />
        </Pressable>
      )}
    </View>
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
  // 활성 방이 생성(응답) 중인지 — 코드 바의 정지 버튼 노출용.
  const isActiveTyping = useIsActiveTyping();
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

  // 코드 탭 미리보기 패널 상태. URL 은 에이전트 응답에서 localhost:PORT 자동 감지.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const conversations = useChatStore((s) => s.conversations);
  const lastUrlRef = useRef('');

  useEffect(() => {
    if (!isCode) return;
    const conv = conversations.find((c) => c.id === active?.id);
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
  }, [conversations, active?.id, isCode]);

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
            // 모델 선택은 코드 세션(=로컬 에이전트)에서만 숨긴다.
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
