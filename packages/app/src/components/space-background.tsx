import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// 다크 테마용 은은한 별밤 배경. 콘텐츠 뒤에 깔리는 장식 레이어(터치 통과).
// 별 위치는 모듈 로드 시 결정론적 의사난수로 한 번만 생성 → 리렌더에도 안 흔들림.

type Star = {
  top: DimensionValue;
  left: DimensionValue;
  size: number;
  opacity: number;
  twinkle: boolean;
};

// 시드 기반 의사난수(0~1). Math.random 을 안 써서 렌더마다 동일.
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const STARS: Star[] = (() => {
  const rng = makeRng(20260605);
  const arr: Star[] = [];
  for (let i = 0; i < 64; i++) {
    const r = rng();
    arr.push({
      top: `${(rng() * 100).toFixed(2)}%` as DimensionValue,
      left: `${(rng() * 100).toFixed(2)}%` as DimensionValue,
      size: r < 0.85 ? 1.5 : 2.5, // 대부분 작은 별, 가끔 큰 별
      opacity: 0.2 + rng() * 0.55,
      twinkle: rng() < 0.22, // 일부만 반짝임
    });
  }
  return arr;
})();

function TwinkleStar({ star, index }: { star: Star; index: number }) {
  const v = useSharedValue(star.opacity);

  useEffect(() => {
    v.value = withDelay(
      (index % 7) * 320,
      withRepeat(
        withSequence(
          withTiming(star.opacity * 0.25, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
          withTiming(star.opacity, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, [v, star.opacity, index]);

  const style = useAnimatedStyle(() => ({ opacity: v.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: star.top,
          left: star.left,
          width: star.size,
          height: star.size,
          borderRadius: 999,
          backgroundColor: '#ffffff',
        },
        style,
      ]}
    />
  );
}

export function SpaceBackground() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {STARS.map((star, i) =>
        star.twinkle ? (
          <TwinkleStar key={i} star={star} index={i} />
        ) : (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              borderRadius: 999,
              backgroundColor: '#ffffff',
              opacity: star.opacity,
            }}
          />
        ),
      )}
    </View>
  );
}
