import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/ui/text';
import { Chip } from '../components/ui/chip';
import { MemoryCard } from '../components/memory/memory-card';
import { MemoryEditSheet } from '../components/memory/memory-edit-sheet';
import { useMemories } from '../hooks/use-memories';
import { useUiStore } from '../store/ui-store';
import { categoryLabel } from '../lib/category';
import type { Memory, MemoryPatch } from '../api/navis';

export function MemoriesScreen() {
  const insets = useSafeAreaInsets();
  const setScreen = useUiStore((s) => s.setScreen);
  const { memories, isLoading, isFetching, isError, refetch, remove, patch } = useMemories();
  const [editing, setEditing] = useState<Memory | null>(null);
  // null = 전체, 그 외엔 해당 분류만
  const [filter, setFilter] = useState<string | null>(null);

  // 실제 존재하는 분류만 칩으로 노출 (+ 각 개수)
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of memories) {
      if (!m.category) continue;
      counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [memories]);

  const filtered = useMemo(
    () => (filter ? memories.filter((m) => m.category === filter) : memories),
    [memories, filter],
  );

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
      : filter
        ? '이 분류의 기억이 없어'
        : '아직 기억이 없어';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2.5">
        <Pressable
          hitSlop={8}
          onPress={() => setScreen('chat')}
          className="h-9 w-9 items-center justify-center rounded-lg cursor-pointer active:bg-secondary hover:bg-secondary"
        >
          <Text className="text-2xl text-foreground">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text variant="subtitle">내 기억</Text>
          <Text variant="caption" className="text-muted-foreground">
            {filter ? `${filtered.length} / ${memories.length}개` : `${memories.length}개`}
          </Text>
        </View>
      </View>

      {categories.length > 0 ? (
        <View className="border-b border-border" style={{ height: 52 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{
              gap: 8,
              paddingHorizontal: 12,
              alignItems: 'center',
            }}
          >
            <Chip label="전체" count={memories.length} active={filter === null} onPress={() => setFilter(null)} />
            {categories.map(([cat, n]) => (
              <Chip
                key={cat}
                label={categoryLabel(cat)}
                count={n}
                active={filter === cat}
                onPress={() => setFilter(filter === cat ? null : cat)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        className="flex-1"
        data={filtered}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          padding: 12,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        renderItem={({ item, index }) => (
          <MemoryCard
            memory={item}
            index={index}
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
