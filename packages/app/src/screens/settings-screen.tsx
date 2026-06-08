import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../lib/cn';
import { Text } from '../components/ui/text';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { LocalAgentSheet } from '../components/local-agent-sheet';
import { ConnectorsSheet } from '../components/connectors-sheet';
import { useUiStore } from '../store/ui-store';
import { useThemeStore } from '../store/theme-store';
import { hasLocalAgent } from '../lib/local-agent';
import { fetchSystemPrompt, saveSystemPrompt } from '../api/settings';
import type { ThemeName } from '../lib/theme';

// 설정 화면 안의 다른 화면(내 기억·프로젝트별 정리)으로 가는 행.
function NavRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between bg-secondary px-4 py-3 cursor-pointer active:opacity-80 hover:bg-muted"
    >
      <Text className="font-medium text-foreground">{label}</Text>
      <Text className="text-lg text-muted-foreground">›</Text>
    </Pressable>
  );
}

function ThemeOption({ value, label, active, onPress }: { value: ThemeName; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-1 items-center rounded-xl border px-4 py-3 cursor-pointer active:opacity-80',
        active ? 'border-primary bg-primary' : 'border-border bg-secondary hover:bg-muted',
      )}
    >
      <Text className={cn('text-[15px] font-medium', active ? 'text-primary-foreground' : 'text-secondary-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const setScreen = useUiStore((s) => s.setScreen);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [prompt, setPrompt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [localSheet, setLocalSheet] = useState(false);
  const [connectorsSheet, setConnectorsSheet] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSystemPrompt()
      .then((v) => {
        if (alive) {
          setPrompt(v);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      await saveSystemPrompt(prompt.trim());
      setSavedMsg('저장됨 — 다음 턴부터 적용');
    } catch {
      setSavedMsg('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2.5">
        <Pressable
          hitSlop={8}
          onPress={() => setScreen('chat')}
          className="h-9 w-9 items-center justify-center rounded-lg cursor-pointer active:bg-secondary hover:bg-secondary"
        >
          <Text className="text-2xl text-foreground">‹</Text>
        </Pressable>
        <Text variant="subtitle">설정</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 24 }}>
        {/* 기억 · 데이터 — 예전엔 사이드바에 있던 진입점을 설정 안으로 모음 */}
        <View className="gap-2">
          <Text className="font-semibold text-foreground">기억 · 데이터</Text>
          <View className="overflow-hidden rounded-xl border border-border">
            <NavRow label="내 기억" onPress={() => setScreen('memories')} />
            <View className="h-px bg-border" />
            <NavRow label="프로젝트별 정리" onPress={() => setScreen('projects')} />
          </View>
        </View>

        {/* 테마 */}
        <View className="gap-2">
          <Text className="font-semibold text-foreground">테마</Text>
          <View className="flex-row gap-2">
            <ThemeOption value="dark" label="다크" active={theme === 'dark'} onPress={() => setTheme('dark')} />
            <ThemeOption value="light" label="라이트" active={theme === 'light'} onPress={() => setTheme('light')} />
          </View>
        </View>

        {/* 커넥터 — 외부 MCP 서버 연결 */}
        <View className="gap-2">
          <Text className="font-semibold text-foreground">커넥터</Text>
          <Text variant="caption" className="text-muted-foreground">
            Notion 등 외부 도구를 연결해요. OAuth 는 브라우저로 한 번 동의하면 이후 자동 갱신,
            또는 MCP URL + API 키로 직접 추가할 수 있어요.
          </Text>
          <Button label="커넥터 관리" variant="secondary" onPress={() => setConnectorsSheet(true)} />
        </View>

        {/* 시스템 프롬프트 */}
        <View className="gap-2">
          <Text className="font-semibold text-foreground">시스템 프롬프트 (나비스 성격·지침)</Text>
          <Text variant="caption" className="text-muted-foreground">
            navis 의 행동 지침이에요. 대화에서 "성격 바꿔줘" 라고 해도 navis 가 직접 갱신해요.
          </Text>
          <Input
            value={prompt}
            onChangeText={setPrompt}
            placeholder={loaded ? '시스템 프롬프트…' : '불러오는 중…'}
            editable={loaded}
            multiline
            className="min-h-48"
            style={{ textAlignVertical: 'top' }}
          />
          <View className="flex-row items-center gap-3">
            <Button label="저장" loading={saving} disabled={!loaded} onPress={save} />
            {savedMsg ? (
              <Text variant="caption" className="text-muted-foreground">
                {savedMsg}
              </Text>
            ) : null}
          </View>
        </View>

        {/* 로컬 에이전트 (데스크톱) */}
        {hasLocalAgent ? (
          <View className="gap-2">
            <Text className="font-semibold text-foreground">로컬 에이전트 (실험적)</Text>
            <Text variant="caption" className="text-muted-foreground">
              내 맥의 파일/터미널 접근. 기본 읽기 전용 — 설정에서 작업 폴더·토큰·쓰기 허용을 정해요.
            </Text>
            <Button label="로컬 에이전트 설정 열기" variant="secondary" onPress={() => setLocalSheet(true)} />
          </View>
        ) : null}
      </ScrollView>

      <LocalAgentSheet open={localSheet} onClose={() => setLocalSheet(false)} />
      <ConnectorsSheet open={connectorsSheet} onClose={() => setConnectorsSheet(false)} />
    </View>
  );
}
