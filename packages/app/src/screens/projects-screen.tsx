import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/ui/text';
import { MemoryCard } from '../components/memory/memory-card';
import { MemoryEditSheet } from '../components/memory/memory-edit-sheet';
import { useMemories } from '../hooks/use-memories';
import { useUiStore } from '../store/ui-store';
import type { Memory, MemoryPatch } from '../api/navis';

const NO_PROJECT = '__none__';

type Section = { project: string; title: string; data: Memory[] };

export function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const setScreen = useUiStore((s) => s.setScreen);
  const { memories, isLoading, isFetching, isError, refetch, remove, patch } = useMemories();
  const [editing, setEditing] = useState<Memory | null>(null);

  // 프로젝트별로 묶기 — 기억 많은 프로젝트가 위로, "프로젝트 없음"은 항상 맨 아래.
  const sections = useMemo<Section[]>(() => {
    const groups = new Map<string, Memory[]>();
    for (const m of memories) {
      const key = m.project?.trim() || NO_PROJECT;
      const arr = groups.get(key);
      if (arr) arr.push(m);
      else groups.set(key, [m]);
    }
    return [...groups.entries()]
      .map(([project, data]) => ({
        project,
        title: project === NO_PROJECT ? '프로젝트 없음' : project,
        data,
      }))
      .sort((a, b) => {
        if (a.project === NO_PROJECT) return 1;
        if (b.project === NO_PROJECT) return -1;
        return b.data.length - a.data.length;
      });
  }, [memories]);

  const projectCount = sections.filter((s) => s.project !== NO_PROJECT).length;

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
      : '정리할 기억이 아직 없어';

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
          <Text variant="subtitle">프로젝트별 정리</Text>
          <Text variant="caption" className="text-muted-foreground">
            {projectCount}개 프로젝트 · 기억 {memories.length}개
          </Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{
          padding: 12,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        renderSectionHeader={({ section }) => (
          <View className="-mx-3 mb-2 mt-1 flex-row items-center gap-2 bg-background px-3 py-1.5">
            <Text className="text-sm font-semibold text-foreground">
              {section.project === NO_PROJECT ? section.title : `#${section.title}`}
            </Text>
            <View className="rounded-full bg-secondary px-2 py-0.5">
              <Text className="text-[11px] font-semibold text-muted-foreground">
                {section.data.length}
              </Text>
            </View>
          </View>
        )}
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
