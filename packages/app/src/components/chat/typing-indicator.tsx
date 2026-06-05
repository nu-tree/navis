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

export type TypingIndicatorProps = {
  className?: string;
  // 점 옆에 "나비스가 ~ 중" 같은 진행 문구를 순환 표시할지 (기본 true)
  showThinking?: boolean;
};

const DOT_COLOR = '#9b9ba8'; // muted-foreground

// 응답을 기다리는 동안 나비스가 "무슨 생각을 하는지" 가볍게 비춰주는 문구들.
const THINKING_PHRASES = [
  '나비스가 생각을 정리하는 중',
  '관련된 기억을 떠올리는 중',
  '맥락을 살펴보는 중',
  '답을 다듬는 중',
];

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

// 순환하는 진행 문구 — 바뀔 때마다 살짝 페이드 인.
function ThinkingLabel() {
  const [i, setI] = useState(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % THINKING_PHRASES.length), 2200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.ease) });
  }, [i, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={style}>
      <Text variant="caption" className="text-muted-foreground">
        {THINKING_PHRASES[i]}…
      </Text>
    </Animated.View>
  );
}

// navis 가 응답 생성 중일 때 표시 — 점 3개 애니메이션 + 진행 문구
export function TypingIndicator({ className, showThinking = true }: TypingIndicatorProps) {
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
      {showThinking ? <ThinkingLabel /> : null}
    </View>
  );
}
