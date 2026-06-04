import { View } from 'react-native';
import { Text } from '../ui/text';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { formatDate } from '../../lib/format';
import type { Memory } from '../../api/navis';

export type MemoryCardProps = {
  memory: Memory;
  onEdit: () => void;
  onDelete: () => void;
};

export function MemoryCard({ memory, onEdit, onDelete }: MemoryCardProps) {
  return (
    <View className="mb-2 rounded-2xl border border-border bg-card p-3.5">
      <View className="mb-1.5 flex-row items-center gap-2">
        {memory.category ? <Badge label={memory.category} variant="secondary" /> : null}
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
    </View>
  );
}
