import { useEffect } from 'react';
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

export type TypingIndicatorProps = {
  className?: string;
};

const DOT_COLOR = '#9b9ba8'; // muted-foreground

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

// navis 가 응답 생성 중일 때 표시 — 점 3개가 순차로 움직이는 애니메이션
export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <View
      className={cn(
        'mb-3 max-w-[82%] flex-row items-center gap-1.5 self-start rounded-2xl rounded-bl-md bg-card px-4 py-3.5',
        className,
      )}
    >
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}
