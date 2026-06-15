import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { cn } from '../../lib/cn';
import { CHAT_MODELS, modelLabel } from '../../lib/models';
import { useChatModel, useChatStore } from '../../store/chat-store';
import { Text } from '../ui/text';
import { Icon } from '../ui/icon';
import { Separator } from '../ui/separator';

// 클로드 데스크톱식 모델 선택 — 헤더 우측 칩. 누르면 바텀시트로 모델 목록을 띄운다.
// 선택은 전역(chat-store.model)이라 모든 일반 채팅에 적용되고 persist 로 유지된다.
export function ModelPicker({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const model = useChatModel();
  const setModel = useChatStore((s) => s.setModel);

  const pick = (value: string) => {
    setModel(value);
    setOpen(false);
  };

  return (
    <>
      {/* 칩 트리거 — 현재 모델 짧은 라벨 */}
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        className={cn(
          'flex-row items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary',
          className,
        )}
      >
        <Icon name="cpu" size={13} tone="foreground" />
        <Text numberOfLines={1} className="max-w-[120px] text-xs font-medium text-foreground">
          {modelLabel(model)}
        </Text>
        <Icon name="chevron-down" size={13} tone="muted-foreground" />
      </Pressable>

      {/* 바텀시트 — 모델 목록(라벨 + 설명 + ✓) */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
          <Pressable
            className="rounded-t-2xl border border-border bg-card pb-6 pt-2"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-1 h-1 w-10 self-center rounded-full bg-border" />
            <Text className="px-5 py-2 text-xs font-semibold text-muted-foreground">모델 선택</Text>
            {CHAT_MODELS.map((m, i) => {
              const active = m.value === model;
              return (
                <View key={m.value}>
                  {i > 0 ? <Separator /> : null}
                  <Pressable
                    onPress={() => pick(m.value)}
                    className="flex-row items-center justify-between px-5 py-3.5 active:bg-secondary"
                  >
                    <View className="flex-1">
                      <Text
                        className={cn(active ? 'font-semibold text-primary' : 'text-foreground')}
                      >
                        {m.label}
                      </Text>
                      <Text className="text-xs text-muted-foreground">{m.hint}</Text>
                    </View>
                    {active ? (
                      <View className="ml-3">
                        <Icon name="check" size={16} tone="primary" />
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
