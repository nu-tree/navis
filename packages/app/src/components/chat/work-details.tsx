import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';

// 클로드 데스크탑식 접이식 '작업·생각 과정' 블록. 답변 본문 위에 회색 박스로 표시되고,
// 누르면 모델의 생각 과정(thinking)과 단계별 작업 행을 펼친다. 둘 다 없으면 렌더 안 함.
// 각 작업은 "실행됨 <설명>" 행으로, 생성 중엔 마지막 행이 "실행 중 <설명>" + 스피너로
// 표시된다. 생성 중(streaming)인 메시지는 자동으로 펼쳐 실시간으로 보여주고, 응답이
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

  // 답변 본문(bg-card)과 명확히 구분되도록 다른 톤(muted)으로 표시.
  return (
    <View className="mb-2 overflow-hidden rounded-xl border border-border bg-muted/60">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center gap-2 px-3 py-2 active:opacity-70"
      >
        {streaming ? (
          <ActivityIndicator size={12} />
        ) : (
          <Text className="text-[11px] text-muted-foreground">{open ? '▾' : '▸'}</Text>
        )}
        <Text className="text-[11px] font-medium text-muted-foreground">
          {streaming ? '실행 중…' : label}
          {tools.length > 0 ? ` · ${tools.length}단계` : ''}
        </Text>
      </Pressable>

      {open ? (
        <View className="border-t border-border bg-background/40">
          {hasThinking ? (
            <Text className="px-3 py-2.5 text-xs italic leading-5 text-muted-foreground">
              {think}
            </Text>
          ) : null}
          {tools.map((t, i) => {
            const running = streaming && i === tools.length - 1;
            return (
              <View
                key={`${t}-${i}`}
                className={cn(
                  'flex-row items-center gap-2 px-3 py-1.5',
                  (i > 0 || hasThinking) && 'border-t border-border/60',
                )}
              >
                {running ? (
                  <ActivityIndicator size={11} />
                ) : (
                  <Text className="w-[11px] text-center text-[10px] text-muted-foreground">
                    ✓
                  </Text>
                )}
                <Text
                  className={cn(
                    'text-[11px]',
                    running ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {running ? '실행 중' : '실행됨'}
                </Text>
                <Text
                  numberOfLines={1}
                  className={cn(
                    'flex-1 text-xs leading-5',
                    running ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
