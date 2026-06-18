// 대화 목록 UI — 채팅/보고서/코드 탭별 방 목록 + 드래그 정렬 + 방 액션 시트.
// 행/액션시트/헬퍼는 ./conversation-list/* 로 분리, 여기서는 조립과 store 연결만.
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../ui/text';
import { Icon } from '../ui/icon';
import { confirmDestructive } from '../../lib/confirm';
import { deleteCron } from '../../api/crons';
import { DraggableRows } from './draggable-rows';
import { useChatStore, type Conversation } from '../../store/chat-store';
import { useUiStore } from '../../store/ui-store';
import { ROW_HEIGHT, cronIdOf } from './conversation-list/helpers';
import { Row } from './conversation-list/row';
import { ConversationActionSheet } from './conversation-list/action-sheet';

export type ConversationListProps = {
  // 대화방 선택/생성 후 호출 (드로어 닫기 등)
  onAfterSelect?: () => void;
};

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
      <ConversationActionSheet
        menuFor={menuFor}
        onClose={closeMenu}
        onHide={hideConversation}
        onDelete={deleteConversation}
        onLeaveCron={leaveCron}
      />
    </View>
  );
}
