import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';
import { confirmDestructive } from '../../lib/confirm';
import { deleteCron } from '../../api/crons';
import { useChatStore, type Conversation } from '../../store/chat-store';

export type ConversationListProps = {
  // 대화방 선택/생성 후 호출 (드로어 닫기 등)
  onAfterSelect?: () => void;
};

// 보고방 중 "크론" 방 판별 — 빌트인 다이제스트/캘린더 외엔 크론(sourceId=크론 id).
const BUILTIN_REPORT_IDS = new Set(['report:digest', 'report:calendar']);
const isCronRoom = (c: Conversation) =>
  c.kind === 'report' && c.id.startsWith('report:') && !BUILTIN_REPORT_IDS.has(c.id);
const cronIdOf = (c: Conversation) => c.id.slice('report:'.length);

function preview(conv: Conversation): string {
  const last = conv.messages[conv.messages.length - 1];
  if (!last) return conv.kind === 'report' ? '아직 보고가 없어' : '새 대화';
  return last.text.replace(/\s+/g, ' ').slice(0, 38);
}

function Row({
  conv,
  active,
  onPress,
  onMenu,
}: {
  conv: Conversation;
  active: boolean;
  onPress: () => void;
  onMenu: () => void;
}) {
  const unread = conv.unread ?? 0;
  const hasUnread = unread > 0;
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'mb-1 flex-row items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:opacity-80',
        active ? 'bg-secondary' : 'bg-transparent hover:bg-muted',
      )}
    >
      <View className="flex-1">
        <Text numberOfLines={1} className={cn('text-sm', (active || hasUnread) && 'font-semibold')}>
          {conv.title}
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
        <Text className="text-base text-muted-foreground">⋯</Text>
      </Pressable>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" className="px-3 pb-1 pt-3 uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
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

  const [menuFor, setMenuFor] = useState<Conversation | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const chats = conversations.filter((c) => c.kind === 'chat' && !c.hidden);
  const reports = conversations.filter((c) => c.kind === 'report' && !c.hidden);
  const hiddenReports = conversations.filter((c) => c.kind === 'report' && c.hidden);

  const select = (id: string) => {
    selectConversation(id);
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
        <SectionLabel>대화</SectionLabel>
        {chats.map((c) => (
          <Row
            key={c.id}
            conv={c}
            active={c.id === activeId}
            onPress={() => select(c.id)}
            onMenu={() => setMenuFor(c)}
          />
        ))}

        <SectionLabel>보고</SectionLabel>
        {reports.map((c) => (
          <Row
            key={c.id}
            conv={c}
            active={c.id === activeId}
            onPress={() => select(c.id)}
            onMenu={() => setMenuFor(c)}
          />
        ))}

        {hiddenReports.length > 0 ? (
          <>
            <Pressable
              onPress={() => setShowHidden((v) => !v)}
              className="mt-1 px-3 py-2 cursor-pointer active:opacity-70"
            >
              <Text variant="caption" className="text-muted-foreground">
                {showHidden ? '▾' : '▸'} 숨긴 보고방 {hiddenReports.length}
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

            {menuFor?.kind === 'chat' ? (
              <ActionRow
                label="대화 삭제"
                danger
                onPress={() => {
                  const target = menuFor;
                  closeMenu();
                  confirmDestructive({
                    title: '대화 삭제',
                    message: '이 대화를 삭제할까?',
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
