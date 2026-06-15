import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';
import { Icon, type IconName } from '../ui/icon';
import { confirmDestructive } from '../../lib/confirm';
import { deleteCron } from '../../api/crons';
import { DraggableRows } from './draggable-rows';
import { useChatStore, type Conversation } from '../../store/chat-store';
import { useUiStore } from '../../store/ui-store';

// 드래그 정렬 슬롯 높이(행 1개분). DraggableRows 의 index 계산에 쓰임.
const ROW_HEIGHT = 58;

export type ConversationListProps = {
  // 대화방 선택/생성 후 호출 (드로어 닫기 등)
  onAfterSelect?: () => void;
};

// 보고방 중 "크론" 방 판별 — 빌트인 다이제스트/캘린더 외엔 크론(sourceId=크론 id).
const BUILTIN_REPORT_IDS = new Set(['report:digest', 'report:calendar']);
const isCronRoom = (c: Conversation) =>
  c.kind === 'report' && c.id.startsWith('report:') && !BUILTIN_REPORT_IDS.has(c.id);
const cronIdOf = (c: Conversation) => c.id.slice('report:'.length);

// 방 종류별 앞 아이콘 — 예전에 제목 앞에 붙던 이모지(📋/⏰/📅) 역할을 대체한다.
function roomIcon(conv: Conversation): IconName | null {
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
const displayTitle = (conv: Conversation): string =>
  roomIcon(conv) ? conv.title.replace(LEAD_EMOJI, '') : conv.title;

function preview(conv: Conversation): string {
  const last = conv.messages[conv.messages.length - 1];
  if (!last) {
    if (conv.kind === 'report') return '아직 보고가 없어';
    if (conv.kind === 'code') return '내 맥에서 코딩 시작';
    return '새 대화';
  }
  return last.text.replace(/\s+/g, ' ').slice(0, 38);
}

function Row({
  conv,
  active,
  handle,
  onPress,
  onMenu,
}: {
  conv: Conversation;
  active: boolean;
  // DraggableRows 가 주는 드래그 핸들 props (없으면 핸들 숨김)
  handle?: object;
  onPress: () => void;
  onMenu: () => void;
}) {
  const unread = conv.unread ?? 0;
  const hasUnread = unread > 0;
  const leadIcon = roomIcon(conv);
  return (
    <Pressable
      onPress={onPress}
      style={{ height: ROW_HEIGHT }}
      className={cn(
        'flex-row items-center gap-1.5 rounded-xl px-2.5 cursor-pointer transition-colors active:opacity-80',
        active ? 'bg-secondary' : 'bg-transparent hover:bg-muted',
      )}
    >
      {handle ? (
        <View {...handle} className="px-1 py-2 cursor-grab active:cursor-grabbing">
          <Icon name="menu" size={15} tone="muted-foreground" />
        </View>
      ) : null}
      {leadIcon ? (
        <View className="w-5 items-center">
          <Icon name={leadIcon} size={15} tone="muted-foreground" />
        </View>
      ) : null}
      <View className="flex-1">
        <Text numberOfLines={1} className={cn('text-sm', (active || hasUnread) && 'font-semibold')}>
          {displayTitle(conv)}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          className={cn(hasUnread ? 'text-foreground' : 'text-muted-foreground')}
        >
          {preview(conv)}
        </Text>
      </View>
      {hasUnread ? (
        <View className="min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5">
          <Text className="text-xs font-bold text-destructive-foreground">
            {unread > 99 ? '99+' : unread}
          </Text>
        </View>
      ) : null}
      <Pressable
        hitSlop={8}
        onPress={onMenu}
        className="rounded-md px-1.5 py-1 cursor-pointer active:opacity-60 hover:bg-secondary"
      >
        <Icon name="more-horizontal" size={16} tone="muted-foreground" />
      </Pressable>
    </Pressable>
  );
}

// 방 액션 시트(바텀시트) — 선택한 방에 맞는 동작만 노출.
function ActionRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl px-4 py-3 cursor-pointer active:bg-secondary hover:bg-secondary"
    >
      <Text className={cn('text-[15px]', danger ? 'text-destructive font-semibold' : 'text-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ConversationList({ onAfterSelect }: ConversationListProps) {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const hideConversation = useChatStore((s) => s.hideConversation);
  const unhideConversation = useChatStore((s) => s.unhideConversation);
  const reorderConversations = useChatStore((s) => s.reorderConversations);
  const newConversation = useChatStore((s) => s.newConversation);
  const newCodeSession = useChatStore((s) => s.newCodeSession);

  const chatTab = useUiStore((s) => s.chatTab);

  const [menuFor, setMenuFor] = useState<Conversation | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const chats = conversations.filter((c) => c.kind === 'chat' && !c.hidden);
  const reports = conversations.filter((c) => c.kind === 'report' && !c.hidden);
  const hiddenReports = conversations.filter((c) => c.kind === 'report' && c.hidden);
  const codeSessions = conversations.filter((c) => c.kind === 'code' && !c.hidden);

  const handleNewCode = () => {
    newCodeSession();
    onAfterSelect?.();
  };

  const select = (id: string) => {
    selectConversation(id);
    onAfterSelect?.();
  };

  const handleNew = () => {
    newConversation();
    onAfterSelect?.();
  };

  const closeMenu = () => setMenuFor(null);

  // 크론 보고방 나가기 — navis에서 크론 삭제 후 방 제거(낙관적). 실패해도 방은 닫힘.
  const leaveCron = (conv: Conversation) => {
    closeMenu();
    confirmDestructive({
      title: '크론 삭제',
      message: `"${conv.title}" 자동화(크론)를 삭제하고 이 방을 나갈까? 되돌릴 수 없어.`,
      confirmLabel: '삭제하고 나가기',
      onConfirm: () => {
        deleteCron(cronIdOf(conv)).catch((e) => console.warn('[cron] 삭제 실패:', e));
        deleteConversation(conv.id);
      },
    });
  };

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 24 }}>
        {/* 채팅 탭 — 일반 대화방만 */}
        {chatTab === 'chat' ? (
          <>
            <View className="flex-row items-center justify-end px-3 pb-1 pt-2">
              <Pressable
                hitSlop={8}
                onPress={handleNew}
                className="flex-row items-center gap-1 rounded-md px-1.5 py-0.5 cursor-pointer active:opacity-60 hover:bg-secondary"
              >
                <Icon name="plus" size={12} tone="muted-foreground" />
                <Text variant="caption" className="text-muted-foreground">
                  새 대화
                </Text>
              </Pressable>
            </View>
            <DraggableRows
              items={chats}
              keyOf={(c) => c.id}
              itemHeight={ROW_HEIGHT}
              onReorder={(ids) => reorderConversations('chat', ids)}
              renderRow={(c, handle) => (
                <Row
                  conv={c}
                  active={c.id === activeId}
                  handle={handle}
                  onPress={() => select(c.id)}
                  onMenu={() => setMenuFor(c)}
                />
              )}
            />
          </>
        ) : null}

        {/* 보고서 탭 — navis 선제 보고방만 */}
        {chatTab === 'report' ? (
          <>
            <DraggableRows
              items={reports}
              keyOf={(c) => c.id}
              itemHeight={ROW_HEIGHT}
              onReorder={(ids) => reorderConversations('report', ids)}
              renderRow={(c, handle) => (
                <Row
                  conv={c}
                  active={c.id === activeId}
                  handle={handle}
                  onPress={() => select(c.id)}
                  onMenu={() => setMenuFor(c)}
                />
              )}
            />

            {reports.length === 0 ? (
              <Text variant="caption" className="px-3 pt-4 text-center text-muted-foreground">
                아직 보고방이 없어 · navis가 보고를 보내면 여기에 모여
              </Text>
            ) : null}

            {hiddenReports.length > 0 ? (
              <>
                <Pressable
                  onPress={() => setShowHidden((v) => !v)}
                  className="mt-1 flex-row items-center gap-1 px-3 py-2 cursor-pointer active:opacity-70"
                >
                  <Icon
                    name={showHidden ? 'chevron-down' : 'chevron-right'}
                    size={12}
                    tone="muted-foreground"
                  />
                  <Text variant="caption" className="text-muted-foreground">
                    숨긴 보고방 {hiddenReports.length}
                  </Text>
                </Pressable>
                {showHidden
                  ? hiddenReports.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => unhideConversation(c.id)}
                        className="mb-1 flex-row items-center justify-between rounded-xl px-3 py-2 cursor-pointer active:opacity-80 hover:bg-muted"
                      >
                        <Text numberOfLines={1} className="flex-1 text-sm text-muted-foreground">
                          {c.title}
                        </Text>
                        <Text variant="caption" className="text-muted-foreground">
                          다시 보이기
                        </Text>
                      </Pressable>
                    ))
                  : null}
              </>
            ) : null}
          </>
        ) : null}

        {/* 코드 탭 — 로컬 에이전트(클로드 코드) 세션만 */}
        {chatTab === 'code' ? (
          <>
            <View className="flex-row items-center justify-end px-3 pb-1 pt-2">
              <Pressable
                hitSlop={8}
                onPress={handleNewCode}
                className="flex-row items-center gap-1 rounded-md px-1.5 py-0.5 cursor-pointer active:opacity-60 hover:bg-secondary"
              >
                <Icon name="plus" size={12} tone="muted-foreground" />
                <Text variant="caption" className="text-muted-foreground">
                  새 코드 세션
                </Text>
              </Pressable>
            </View>
            <DraggableRows
              items={codeSessions}
              keyOf={(c) => c.id}
              itemHeight={ROW_HEIGHT}
              onReorder={(ids) => reorderConversations('code', ids)}
              renderRow={(c, handle) => (
                <Row
                  conv={c}
                  active={c.id === activeId}
                  handle={handle}
                  onPress={() => select(c.id)}
                  onMenu={() => setMenuFor(c)}
                />
              )}
            />
            {codeSessions.length === 0 ? (
              <Text variant="caption" className="px-3 pt-4 text-center text-muted-foreground">
                "+ 새 코드 세션"으로 내 맥 폴더에서 코딩을 시작해
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* 방 액션 시트 */}
      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={closeMenu}>
          <Pressable
            className="gap-1 rounded-t-2xl border border-border bg-card px-3 pb-8 pt-3"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-1 h-1 w-10 self-center rounded-full bg-border" />
            <Text variant="caption" className="px-4 pb-1 text-muted-foreground" numberOfLines={1}>
              {menuFor?.title}
            </Text>

            {menuFor?.kind === 'report' ? (
              <ActionRow
                label="숨기기"
                onPress={() => {
                  if (menuFor) hideConversation(menuFor.id);
                  closeMenu();
                }}
              />
            ) : null}

            {menuFor && isCronRoom(menuFor) ? (
              <ActionRow label="크론 삭제하고 나가기" danger onPress={() => leaveCron(menuFor)} />
            ) : null}

            {menuFor?.kind === 'chat' || menuFor?.kind === 'code' ? (
              <ActionRow
                label={menuFor?.kind === 'code' ? '코드 세션 삭제' : '대화 삭제'}
                danger
                onPress={() => {
                  const target = menuFor;
                  const isCode = target?.kind === 'code';
                  closeMenu();
                  confirmDestructive({
                    title: isCode ? '코드 세션 삭제' : '대화 삭제',
                    message: isCode ? '이 코드 세션을 삭제할까?' : '이 대화를 삭제할까?',
                    confirmLabel: '삭제',
                    onConfirm: () => deleteConversation(target.id),
                  });
                }}
              />
            ) : null}

            <ActionRow label="취소" onPress={closeMenu} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
