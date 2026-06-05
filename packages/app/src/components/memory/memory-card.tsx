import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Text } from '../ui/text';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { formatDate } from '../../lib/format';
import { categoryLabel } from '../../lib/category';
import type { Memory } from '../../api/navis';

export type MemoryCardProps = {
  memory: Memory;
  // 리스트에서의 순서 — 등장 애니메이션을 살짝 계단식으로 지연시키는 데 쓴다.
  index?: number;
  onEdit: () => void;
  onDelete: () => void;
};

export function MemoryCard({ memory, index = 0, onEdit, onDelete }: MemoryCardProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}
      className="mb-2 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:border-muted-foreground"
    >
      <View className="mb-1.5 flex-row items-center gap-2">
        {memory.category ? (
          <Badge label={categoryLabel(memory.category)} variant="secondary" />
        ) : null}
        {memory.project ? (
          <Text variant="caption" className="text-muted-foreground">
            #{memory.project}
          </Text>
        ) : null}
        <View className="flex-1" />
        <Text variant="caption" className="text-muted-foreground">
          {formatDate(memory.createdAt)}
        </Text>
      </View>

      <Text className="text-[15px] leading-5 text-card-foreground">{memory.content}</Text>

      <View className="mt-2 flex-row justify-end gap-1">
        <Button label="수정" size="sm" variant="ghost" onPress={onEdit} />
        <Button
          label="삭제"
          size="sm"
          variant="ghost"
          textClassName="text-destructive"
          onPress={onDelete}
        />
      </View>
    </Animated.View>
  );
}
