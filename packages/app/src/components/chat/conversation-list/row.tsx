// 대화 목록의 행(row) 아이템 — lead 아이콘 + 제목/미리보기 + 안읽음 배지 + 더보기 버튼.
// DraggableRows 의 renderRow 에서 사용된다.
import { Pressable, View } from 'react-native';
import { cn } from '../../../lib/cn';
import { Text } from '../../ui/text';
import { Icon } from '../../ui/icon';
import type { Conversation } from '../../../store/chat-store';
import { ROW_HEIGHT, displayTitle, preview, roomIcon } from './helpers';

export function Row({
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
