import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../ui/text';

// 클로드 데스크탑식 접이식 '작업·생각 과정' 블록. 답변 본문 위에 회색 박스로 접혀 있고,
// 누르면 모델의 생각 과정(thinking)과 사용한 도구 목록을 펼친다. 둘 다 없으면 렌더 안 함.
// 진행 중 실시간 상태는 TypingIndicator 가 따로 보여주므로 여기선 기본 접힘으로 깔끔하게.
export function WorkDetails({
  thinking,
  toolsUsed,
}: {
  thinking?: string;
  toolsUsed?: string[];
}) {
  const tools = toolsUsed ?? [];
  const think = thinking?.trim() ?? '';
  const hasThinking = think.length > 0;
  const [open, setOpen] = useState(false);

  if (!hasThinking && tools.length === 0) return null;

  const label =
    hasThinking && tools.length > 0
      ? '생각·작업 과정'
      : hasThinking
        ? '생각 과정'
        : '작업 과정';

  return (
    <View className="mb-2 overflow-hidden rounded-xl border border-border bg-secondary">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center gap-1.5 px-3 py-2 active:opacity-70"
      >
        <Text className="text-[11px] text-muted-foreground">{open ? '▾' : '▸'}</Text>
        <Text className="text-[11px] font-medium text-muted-foreground">
          {label}
          {tools.length > 0 ? ` · ${tools.length}` : ''}
        </Text>
      </Pressable>

      {open ? (
        <View className="gap-1 border-t border-border px-3 py-2">
          {hasThinking ? (
            <Text className="mb-1 text-xs italic leading-5 text-muted-foreground">{think}</Text>
          ) : null}
          {tools.map((t, i) => (
            <Text key={`${t}-${i}`} className="text-xs text-muted-foreground">
              ● {t}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
