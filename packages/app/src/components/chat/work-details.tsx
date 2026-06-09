import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../ui/text';

// 클로드 데스크탑식 접이식 '작업·생각 과정' 블록. 답변 본문 위에 회색 박스로 표시되고,
// 누르면 모델의 생각 과정(thinking)과 사용한 도구 목록을 펼친다. 둘 다 없으면 렌더 안 함.
// 생성 중(streaming)인 메시지는 자동으로 펼쳐 생각·작업을 실시간으로 보여주고, 응답이
// 끝나면 자동으로 접어 깔끔하게 정리한다(사용자가 수동으로 다시 펼/접을 수 있음).
export function WorkDetails({
  thinking,
  toolsUsed,
  streaming = false,
}: {
  thinking?: string;
  toolsUsed?: string[];
  streaming?: boolean;
}) {
  const tools = toolsUsed ?? [];
  const think = thinking?.trim() ?? '';
  const hasThinking = think.length > 0;
  const [open, setOpen] = useState(streaming);

  // 생성 시작 → 자동 펼침, 생성 종료 → 자동 접힘. streaming 이 바뀔 때만 동기화하므로
  // 그 사이 사용자가 수동 토글한 상태는 유지된다.
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    if (streaming !== prevStreaming.current) {
      setOpen(streaming);
      prevStreaming.current = streaming;
    }
  }, [streaming]);

  if (!hasThinking && tools.length === 0) return null;

  const label =
    hasThinking && tools.length > 0
      ? '생각·작업 과정'
      : hasThinking
        ? '생각 과정'
        : '작업 과정';

  // 답변 본문(bg-card)과 명확히 구분되도록 다른 톤(muted)·아이콘으로 표시.
  return (
    <View className="mb-2 overflow-hidden rounded-xl border border-border bg-muted/60">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center gap-1.5 px-3 py-2 active:opacity-70"
      >
        <Text className="text-[11px] text-muted-foreground">{open ? '▾' : '▸'}</Text>
        <Text className="text-[11px]">{hasThinking ? '💭' : '🔧'}</Text>
        <Text className="text-[11px] font-medium text-muted-foreground">
          {streaming ? `${label} 중…` : label}
          {tools.length > 0 ? ` · ${tools.length}단계` : ''}
        </Text>
      </Pressable>

      {open ? (
        <View className="gap-1.5 border-t border-border bg-background/40 px-3 py-2.5">
          {hasThinking ? (
            <Text className="mb-1 text-xs italic leading-5 text-muted-foreground">{think}</Text>
          ) : null}
          {tools.map((t, i) => (
            <Text key={`${t}-${i}`} className="text-xs leading-5 text-muted-foreground">
              {t}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
