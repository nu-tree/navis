import { useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/ui/text';
import { MemoryCard } from '../components/memory/memory-card';
import { MemoryEditSheet } from '../components/memory/memory-edit-sheet';
import { useMemories } from '../hooks/use-memories';
import { useUiStore } from '../store/ui-store';
import type { Memory, MemoryPatch } from '../api/navis';

export function MemoriesScreen() {
  const insets = useSafeAreaInsets();
  const setScreen = useUiStore((s) => s.setScreen);
  const { memories, isLoading, isFetching, isError, refetch, remove, patch } = useMemories();
  const [editing, setEditing] = useState<Memory | null>(null);

  const confirmDelete = (m: Memory) => {
    Alert.alert('기억 삭제', '이 기억을 영구 삭제할까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => remove.mutate(m.id) },
    ]);
  };

  const handleSave = (id: string, p: MemoryPatch) => {
    patch.mutate({ id, patch: p }, { onSuccess: () => setEditing(null) });
  };

  const emptyText = isError
    ? '기억을 불러오지 못했어'
    : isLoading
      ? '불러오는 중…'
      : '아직 기억이 없어';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2.5">
        <Pressable
          hitSlop={8}
          onPress={() => setScreen('chat')}
          className="h-9 w-9 items-center justify-center rounded-lg active:bg-secondary"
        >
          <Text className="text-2xl text-foreground">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text variant="subtitle">🧠 내 기억</Text>
          <Text variant="caption" className="text-muted-foreground">
            {memories.length}개
          </Text>
        </View>
      </View>

      <FlatList
        data={memories}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          padding: 12,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        renderItem={({ item }) => (
          <MemoryCard
            memory={item}
            onEdit={() => setEditing(item)}
            onDelete={() => confirmDelete(item)}
          />
        )}
        refreshing={isFetching}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center">
            <Text variant="muted">{emptyText}</Text>
          </View>
        }
      />

      <MemoryEditSheet
        memory={editing}
        saving={patch.isPending}
        onClose={() => setEditing(null)}
        onSave={handleSave}
      />
    </View>
  );
}
