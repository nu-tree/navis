// 방 액션 시트(바텀시트) — 선택한 방에 맞는 동작(숨기기/삭제/크론 나가기)만 노출.
// 상태(menuFor)와 동작 콜백은 부모(ConversationList)가 주입한다.
import { Modal, Pressable, View } from 'react-native';
import { cn } from '../../../lib/cn';
import { Text } from '../../ui/text';
import { confirmDestructive } from '../../../lib/confirm';
import type { Conversation } from '../../../store/chat-store';
import { isCronRoom } from './helpers';

// 액션 시트 안의 한 줄(버튼). danger 면 강조색.
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

export type ConversationActionSheetProps = {
  // 액션 대상 방 (null 이면 시트 닫힘)
  menuFor: Conversation | null;
  onClose: () => void;
  onHide: (id: string) => void;
  onDelete: (id: string) => void;
  onLeaveCron: (conv: Conversation) => void;
};

export function ConversationActionSheet({
  menuFor,
  onClose,
  onHide,
  onDelete,
  onLeaveCron,
}: ConversationActionSheetProps) {
  return (
    <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
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
                if (menuFor) onHide(menuFor.id);
                onClose();
              }}
            />
          ) : null}

          {menuFor && isCronRoom(menuFor) ? (
            <ActionRow label="크론 삭제하고 나가기" danger onPress={() => onLeaveCron(menuFor)} />
          ) : null}

          {menuFor?.kind === 'chat' || menuFor?.kind === 'code' ? (
            <ActionRow
              label={menuFor?.kind === 'code' ? '코드 세션 삭제' : '대화 삭제'}
              danger
              onPress={() => {
                const target = menuFor;
                const isCode = target?.kind === 'code';
                onClose();
                confirmDestructive({
                  title: isCode ? '코드 세션 삭제' : '대화 삭제',
                  message: isCode ? '이 코드 세션을 삭제할까?' : '이 대화를 삭제할까?',
                  confirmLabel: '삭제',
                  onConfirm: () => onDelete(target.id),
                });
              }}
            />
          ) : null}

          <ActionRow label="취소" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
