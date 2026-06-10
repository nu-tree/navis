import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';
import { useChatStore } from '../../store/chat-store';

export type TypingIndicatorProps = {
  className?: string;
  showThinking?: boolean;
};

const DOT_COLOR = '#9b9ba8';

const THINKING_PHRASES = [
  '나비스가 생각을 정리하는 중',
  '관련된 기억을 떠올리는 중',
  '맥락을 살펴보는 중',
  '답을 다듬는 중',
];

// 도구 이름 → 사람이 읽기 좋은 한국어 진행 문구
const TOOL_LABELS: Record<string, string> = {
  mcp__namory__recall: '기억을 찾는 중',
  mcp__namory__save: '기억을 저장하는 중',
  mcp__namory__recent: '최근 기억을 보는 중',
  mcp__namory__todos: '할 일 목록을 확인하는 중',
  mcp__google__list_events: '캘린더를 확인하는 중',
  mcp__google__create_event: '일정을 추가하는 중',
  mcp__google__update_event: '일정을 수정하는 중',
  mcp__google__delete_event: '일정을 삭제하는 중',
  mcp__repo__read_repo_file: '코드를 확인하는 중',
  mcp__repo__list_repo_files: '파일 목록을 보는 중',
  mcp__self_modify__request_self_modification: '개선 작업을 요청하는 중',
  mcp__cron__list_crons: '예약 작업을 확인하는 중',
  mcp__cron__create_cron: '예약 작업을 추가하는 중',
  Read: '파일을 읽는 중',
  Write: '파일을 쓰는 중',
  Edit: '파일을 수정하는 중',
  Bash: '명령을 실행하는 중',
  WebSearch: '검색하는 중',
  WebFetch: '페이지를 읽는 중',
};

function toolLabel(tool: string): string {
  // 의사 상태 — use-send-message 가 스트림 단계에 따라 넣는다.
  if (tool === '__thinking__') return '생각하는 중';
  if (tool === '__answering__') return '답변 작성하는 중';
  if (TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  if (tool.startsWith('mcp__google__')) return '캘린더 작업 중';
  if (tool.startsWith('mcp__namory__')) return '기억 작업 중';
  if (tool.startsWith('mcp__cron__')) return '예약 작업 중';
  // 서버가 보내는 리치 레이블("기억 검색: …", "실행: …")은 그대로 표시.
  // 영문 식별자(모르는 도구 이름)만 일반 문구로 뭉갠다.
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tool)) return tool;
  return '작업하는 중';
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}분 ${rem}초` : `${m}분`;
}

// 점 하나 — delay 를 다르게 줘 파도처럼 순차로 튄다.
function Dot({ delay }: { delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 350, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 350, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, [progress, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -progress.value * 4 }],
  }));

  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 999, backgroundColor: DOT_COLOR }, style]}
    />
  );
}

// 진행 문구 — 실제 도구 상태가 있으면 그걸, 없으면 기본 문구를 순환.
function ThinkingLabel({ status, startedAt }: { status: string; startedAt?: number }) {
  const [i, setI] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const opacity = useSharedValue(1);
  const label = status ? toolLabel(status) : THINKING_PHRASES[i];

  // 경과 시간 카운터
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // 도구 상태 없을 때만 문구 순환
  useEffect(() => {
    if (status) return;
    const id = setInterval(() => setI((p) => (p + 1) % THINKING_PHRASES.length), 2200);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.ease) });
  }, [label, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // 경과 시간은 1초부터 바로 표시 — 클로드 코드처럼 "지금 N초째 작업 중"이 항상 보이게.
  const elapsedStr = elapsed >= 1000 ? ` · ${formatElapsed(elapsed)}` : '';

  return (
    <Animated.View style={style}>
      <Text variant="caption" className="text-muted-foreground">
        {label}…{elapsedStr}
      </Text>
    </Animated.View>
  );
}

// navis 가 응답 생성 중일 때 표시 — 점 3개 애니메이션 + 진행 문구 + 경과 시간
export function TypingIndicator({ className, showThinking = true }: TypingIndicatorProps) {
  const activeId = useChatStore((s) => s.activeId);
  const status = useChatStore((s) => s.typingStatus[activeId] ?? '');
  const startedAt = useChatStore((s) => s.typingStartedAt[activeId]);

  return (
    <View
      className={cn(
        'mb-3 max-w-[82%] flex-row items-center gap-2 self-start rounded-2xl rounded-bl-md bg-card px-4 py-3.5',
        className,
      )}
    >
      <View className="flex-row items-center gap-1.5">
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
      {showThinking ? <ThinkingLabel status={status} startedAt={startedAt} /> : null}
    </View>
  );
}
