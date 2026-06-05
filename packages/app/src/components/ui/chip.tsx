import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { cn } from '../../lib/cn';
import { Text } from './text';

export type ChipProps = Omit<PressableProps, 'children'> & {
  label: string;
  active?: boolean;
  // 우측에 작은 카운트 표시 (선택)
  count?: number;
  className?: string;
};

// 토글 가능한 필터 칩 — 웹에선 hover 반응, 모든 플랫폼에서 누르면 살짝 줄어드는 피드백.
// 애니메이션 style 은 바깥 Animated.View 에, className 스타일은 안쪽 Pressable 에 분리해 둔다.
export function Chip({ label, active, count, className, ...props }: ChipProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          scale.value = withTiming(0.94, { duration: 90 });
          props.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withTiming(1, { duration: 130 });
          props.onPressOut?.(e);
        }}
        className={cn(
          'flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 cursor-pointer transition-colors',
          active
            ? 'border-primary bg-primary'
            : 'border-border bg-secondary hover:border-muted-foreground hover:bg-muted',
          className,
        )}
      >
        <Text
          className={cn(
            'text-xs font-medium',
            active ? 'text-primary-foreground' : 'text-secondary-foreground',
          )}
        >
          {label}
        </Text>
        {typeof count === 'number' ? (
          <Text
            className={cn(
              'text-[11px] font-semibold',
              active ? 'text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {count}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
