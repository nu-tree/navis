import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui/text';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { localAgent } from '../lib/local-agent';

// 데스크톱 로컬 에이전트 설정 시트(실험적). 켜기/작업폴더/토큰/쓰기허용.
export function LocalAgentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [enabled, setEnabled] = useState(false);
  const [workdir, setWorkdir] = useState('');
  const [allowWrite, setAllowWrite] = useState(false);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !localAgent) return;
    localAgent.getConfig().then((c) => {
      setEnabled(c.enabled);
      setWorkdir(c.workdir);
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
        enabled,
        workdir: workdir.trim(),
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
          <Text variant="subtitle">로컬 에이전트 (실험적)</Text>
          <Text variant="caption" className="text-muted-foreground">
            내 맥의 파일/터미널에 접근해요. 기본은 읽기 전용 — 쓰기/명령 실행은 아래에서 허용해야 켜져요.
          </Text>

          <Toggle on={enabled} onPress={() => setEnabled((v) => !v)} label="로컬 에이전트 사용" />

          <View>
            <Text variant="caption" className="mb-1 text-muted-foreground">
              작업 폴더 (절대경로)
            </Text>
            <Input value={workdir} onChangeText={setWorkdir} placeholder="/Users/내이름/project" autoCapitalize="none" />
          </View>

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
            label="⚠️ 쓰기·터미널 허용 (Edit/Write/Bash)"
          />

          <View className="mt-1 flex-row gap-2">
            <Button label="취소" variant="secondary" className="flex-1" onPress={onClose} />
            <Button label="저장" className="flex-1" loading={saving} onPress={save} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
