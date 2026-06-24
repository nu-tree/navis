import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '../ui/text';
import { Icon } from '../ui/icon';
import {
  useVoiceConversation,
  type VoicePhase,
} from '../../hooks/use-voice-conversation';

// 핸즈프리 음성 대화모드 — ChatGPT Voice 풍의 신비로운 풀스크린 UI.
// expo-linear-gradient/blur 같은 네이티브 추가 없이(=OTA 로 보낼 수 있게) 순수 reanimated 로,
// 색 블롭 3개가 서로 다른 속도로 궤도를 돌며 반투명하게 겹쳐 오로라처럼 보이게 한다.
// 자막: 듣는 중엔 내가 말한 텍스트, 답할 땐 navis 응답을 글로도 보여준다.

// 상태별 블롭 색(3겹). 겹치면 반투명으로 섞여 깊이감이 생긴다.
const ORB_COLORS: Record<VoicePhase, [string, string, string]> = {
  idle: ['#475569', '#334155', '#1e293b'],
  listening: ['#38bdf8', '#22d3ee', '#818cf8'], // 시안~블루~인디고
  thinking: ['#a78bfa', '#818cf8', '#c084fc'], // 퍼플
  speaking: ['#60a5fa', '#34d399', '#a5b4fc'], // 블루~민트
  denied: ['#64748b', '#475569', '#334155'],
  error: ['#64748b', '#475569', '#334155'],
};

const LABEL: Record<VoicePhase, string> = {
  idle: '',
  listening: '듣고 있어요',
  thinking: '생각 중…',
  speaking: '말하는 중',
  denied: '권한이 필요해요',
  error: '문제가 생겼어요',
};

// 중심에서 radius 만큼 떨어진 색 원이 컨테이너 회전을 따라 궤도를 돈다.
function OrbitBlob({
  color,
  size,
  radius,
  duration,
  reverse,
}: {
  color: string;
  size: number;
  radius: number;
  duration: number;
  reverse?: boolean;
}) {
  const angle = useSharedValue(0);
  useEffect(() => {
    angle.value = withRepeat(
      withTiming(reverse ? -1 : 1, { duration, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(angle);
  }, [angle, duration, reverse]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value * 360}deg` }],
  }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.center, style]}
      pointerEvents="none"
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.55,
          transform: [{ translateX: radius }],
        }}
      />
    </Animated.View>
  );
}

function MysticOrb({ phase }: { phase: VoicePhase }) {
  const [c1, c2, c3] = ORB_COLORS[phase] ?? ORB_COLORS.idle;
  // 전체 호흡(맥동) — 상태마다 속도가 달라 듣기는 잔잔, 말하기는 활발.
  const breath = useSharedValue(1);
  useEffect(() => {
    const dur =
      phase === 'speaking' ? 620 : phase === 'thinking' ? 780 : 1500;
    const to = phase === 'speaking' ? 1.12 : phase === 'thinking' ? 1.07 : 1.05;
    breath.value = withRepeat(withTiming(to, { duration: dur }), -1, true);
    return () => cancelAnimation(breath);
  }, [phase, breath]);
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  return (
    <Animated.View style={[styles.orb, breathStyle]}>
      {/* 바깥 발광 halo */}
      <View
        style={[
          styles.halo,
          { backgroundColor: c1, shadowColor: c1 },
        ]}
      />
      {/* 궤도 블롭들 — 서로 다른 속도/방향으로 돌며 색이 섞인다 */}
      <OrbitBlob color={c1} size={150} radius={26} duration={7000} />
      <OrbitBlob color={c2} size={130} radius={40} duration={9000} reverse />
      <OrbitBlob color={c3} size={110} radius={30} duration={5200} />
      {/* 중심 코어 */}
      <View style={[styles.core, { backgroundColor: c2 }]} />
    </Animated.View>
  );
}

export function VoiceModeOverlay() {
  const { phase, partial, answer, errorText, interrupt, exit } =
    useVoiceConversation();

  // 듣는 중엔 내가 말한 인식 텍스트, 답할 땐 navis 응답을 글로 보여준다.
  const isError = phase === 'denied' || phase === 'error';
  const caption = isError
    ? (errorText ?? '')
    : phase === 'listening'
      ? partial
      : answer;
  const captionFrom =
    phase === 'speaking' || phase === 'thinking' ? '나비스' : '나';

  // speaking 중 화면 탭 → 끼어들기(navis 말 끊고 다시 듣기).
  const onBackdropPress = phase === 'speaking' ? interrupt : undefined;

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={exit}
      statusBarTranslucent
    >
      <Pressable onPress={onBackdropPress} style={styles.backdrop}>
        {/* 상단 종료 */}
        <View style={styles.topBar}>
          <Pressable hitSlop={12} onPress={exit} style={styles.iconBtn}>
            <Icon name="x" size={26} tone="foreground" />
          </Pressable>
        </View>

        {/* 중앙: orb + 상태 라벨 */}
        <View style={styles.center}>
          <MysticOrb phase={phase} />
          <Text style={styles.statusLabel}>{LABEL[phase]}</Text>
        </View>

        {/* 하단: 자막(글로도 확인). pointerEvents=none — speaking 중 자막 영역을 탭해도
            ScrollView 가 터치를 삼키지 않고 backdrop(끼어들기)으로 전달되게 한다. */}
        <View style={styles.captionArea} pointerEvents="none">
          {caption ? (
            <>
              <Text style={styles.captionFrom}>{captionFrom}</Text>
              <ScrollView
                style={styles.captionScroll}
                contentContainerStyle={styles.captionScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.captionText}>{caption}</Text>
              </ScrollView>
            </>
          ) : phase === 'listening' ? (
            <Text style={styles.hint}>말씀하세요…</Text>
          ) : null}
          {phase === 'speaking' ? (
            <Text style={styles.hint}>화면을 탭하면 끊고 말할 수 있어요</Text>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const ORB_SIZE = 200;
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#070810', // 신비로운 다크 배경
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  topBar: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end' },
  iconBtn: {
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    opacity: 0.25,
    shadowOpacity: 0.9,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  core: {
    width: 86,
    height: 86,
    borderRadius: 43,
    opacity: 0.85,
  },
  statusLabel: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  captionArea: { minHeight: 132, width: '100%', alignItems: 'center', gap: 8 },
  captionFrom: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  captionScroll: { maxHeight: 96, alignSelf: 'stretch' },
  captionScrollContent: { alignItems: 'center', paddingVertical: 2 },
  captionText: {
    color: '#f1f5f9',
    fontSize: 19,
    lineHeight: 28,
    textAlign: 'center',
  },
  hint: { color: 'rgba(148,163,184,0.7)', fontSize: 13, textAlign: 'center' },
});
