import { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
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

// 핸즈프리 음성 대화모드 전용 풀스크린 오버레이(ChatGPT Voice 식).
// 중앙 orb 가 상태(듣기/생각/말하기)에 따라 맥동하고, 자막과 종료 버튼을 보여준다.
// speaking 중 화면을 탭하면 끼어들어 다시 듣는다.

const PULSE: Record<string, { to: number; dur: number }> = {
  listening: { to: 1.18, dur: 1100 }, // 부드러운 호흡
  thinking: { to: 1.1, dur: 520 }, // 빠른 떨림
  speaking: { to: 1.3, dur: 360 }, // 큰 파동
};

const LABEL: Record<VoicePhase, string> = {
  idle: '',
  listening: '듣고 있어요',
  thinking: '생각 중…',
  speaking: '말하는 중',
  denied: '권한이 필요해요',
  error: '문제가 생겼어요',
};

function Orb({ phase }: { phase: VoicePhase }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    const cfg = PULSE[phase];
    if (cfg) {
      scale.value = withRepeat(
        withTiming(cfg.to, { duration: cfg.dur }),
        -1,
        true,
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 200 });
    }
    return () => cancelAnimation(scale);
  }, [phase, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dim = phase === 'denied' || phase === 'error';

  return (
    <Animated.View
      style={style}
      className={
        'h-44 w-44 items-center justify-center rounded-full ' +
        (dim ? 'bg-secondary' : 'bg-primary')
      }
    >
      <View className="h-40 w-40 items-center justify-center rounded-full bg-primary/30">
        <Icon
          name={dim ? 'mic-off' : 'mic'}
          size={48}
          tone={dim ? 'muted-foreground' : 'primary-foreground'}
        />
      </View>
    </Animated.View>
  );
}

export function VoiceModeOverlay() {
  const { phase, partial, answer, errorText, interrupt, exit } =
    useVoiceConversation();

  // 듣는 중엔 인식 자막(없으면 안내), 말하는 중엔 응답 자막을 보여준다.
  const caption =
    phase === 'listening'
      ? partial || '말씀하세요'
      : phase === 'speaking'
        ? answer
        : phase === 'denied' || phase === 'error'
          ? (errorText ?? '')
          : '';

  // speaking 중 화면 탭 → 끼어들기(navis 말 끊고 다시 듣기).
  const onBackdropPress = phase === 'speaking' ? interrupt : undefined;

  return (
    <Modal
      visible
      animationType="fade"
      transparent={false}
      onRequestClose={exit}
      statusBarTranslucent
    >
      <Pressable
        onPress={onBackdropPress}
        className="flex-1 items-center justify-between bg-background px-6 py-12"
      >
        {/* 상단 종료 버튼 */}
        <View className="w-full flex-row justify-end">
          <Pressable
            hitSlop={12}
            onPress={exit}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
          >
            <Icon name="x" size={24} tone="foreground" />
          </Pressable>
        </View>

        {/* 중앙: orb + 상태 라벨 */}
        <View className="items-center gap-6">
          <Orb phase={phase} />
          <Text variant="subtitle" className="text-muted-foreground">
            {LABEL[phase]}
          </Text>
        </View>

        {/* 하단: 자막 + 힌트 */}
        <View className="min-h-[96px] w-full items-center justify-start">
          {caption ? (
            <Text className="text-center text-lg leading-7" numberOfLines={4}>
              {caption}
            </Text>
          ) : null}
          {phase === 'speaking' ? (
            <Text variant="caption" className="mt-3 text-muted-foreground">
              화면을 탭하면 끊고 말할 수 있어요
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}
