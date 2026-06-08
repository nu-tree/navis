import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui/text';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { localAgent } from '../lib/local-agent';

// 코드 에이전트 설정 시트 — 토큰 + 쓰기/터미널 허용만. 작업 폴더는 세션별로 코드 탭의
// 폴더 칩에서 고르므로 여기엔 없다. '로컬 모드 켜기' 토글도 제거(코드는 항상 로컬).
export function LocalAgentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [allowWrite, setAllowWrite] = useState(false);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !localAgent) return;
    localAgent.getConfig().then((c) => {
      setAllowWrite(c.allowWrite);
      setHasToken(c.hasToken);
      setToken('');
    });
  }, [open]);

  const save = async () => {
    if (!localAgent) return;
    setSaving(true);
    try {
      await localAgent.setConfig({
        // 코드는 항상 로컬이라 enabled 는 늘 true 로 둔다(설정 일관성).
        enabled: true,
        allowWrite,
        ...(token.trim() ? { token: token.trim() } : {}),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) => (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between rounded-xl bg-input px-4 py-3 cursor-pointer active:opacity-80"
    >
      <Text className="text-[15px] text-foreground">{label}</Text>
      <View className={`h-6 w-11 rounded-full px-0.5 ${on ? 'bg-primary' : 'bg-secondary'} justify-center`}>
        <View className={`h-5 w-5 rounded-full bg-background ${on ? 'self-end' : 'self-start'}`} />
      </View>
    </Pressable>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="gap-3 rounded-t-2xl border border-border bg-card px-4 pt-4"
          style={{ paddingBottom: insets.bottom + 16 }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-1 h-1 w-10 self-center rounded-full bg-border" />
          <Text variant="subtitle">코드 에이전트 설정</Text>
          <Text variant="caption" className="text-muted-foreground">
            코드 탭은 내 맥에서 돌아요. 작업 폴더는 코드 탭의 폴더 칩에서 세션마다 고르고,
            여기선 토큰과 쓰기 허용만 정해요. 기본은 읽기 전용.
          </Text>

          <View>
            <Text variant="caption" className="mb-1 text-muted-foreground">
              CLAUDE_CODE_OAUTH_TOKEN {hasToken ? '(설정됨 — 바꿀 때만 입력)' : '(미설정)'}
            </Text>
            <Input
              value={token}
              onChangeText={setToken}
              placeholder={hasToken ? '••••••••' : 'sk-ant-oat-…'}
              autoCapitalize="none"
              secureTextEntry
            />
          </View>

          <Toggle
            on={allowWrite}
            onPress={() => setAllowWrite((v) => !v)}
            label="⚠️ 전체 제어 허용"
          />
          <Text variant="caption" className="text-muted-foreground">
            켜면 클로드 코드처럼 확인 없이 파일 수정·터미널 명령·설치(brew/xcodebuild/simctl
            등)까지 내 맥 전체를 조작해요. 끄면 읽기 전용(안전). 신뢰할 때만 켜세요.
          </Text>

          <View className="mt-1 flex-row gap-2">
            <Button label="취소" variant="secondary" className="flex-1" onPress={onClose} />
            <Button label="저장" className="flex-1" loading={saving} onPress={save} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
