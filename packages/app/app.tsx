import './global.css';

import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatScreen } from './src/screens/chat-screen';
import { MemoriesScreen } from './src/screens/memories-screen';
import { ProjectsScreen } from './src/screens/projects-screen';
import { SpaceBackground } from './src/components/space-background';
import { useUiStore } from './src/store/ui-store';
import { useThemeStore } from './src/store/theme-store';
import { THEME_VARS } from './src/lib/theme';

const queryClient = new QueryClient();

function Screen() {
  const screen = useUiStore((s) => s.screen);
  if (screen === 'memories') return <MemoriesScreen />;
  if (screen === 'projects') return <ProjectsScreen />;
  return <ChatScreen />;
}

function Root() {
  const theme = useThemeStore((s) => s.theme);
  return (
    // 테마 변수를 루트에서 주입 → 하위 트리의 시맨틱 토큰이 교체된다(웹/네이티브 공용).
    <View style={[{ flex: 1 }, THEME_VARS[theme]]} className="flex-1 bg-background">
      {/* 다크 테마에서만 별밤 배경(콘텐츠 뒤, 터치 통과) */}
      {theme === 'dark' ? <SpaceBackground /> : null}
      <Screen />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
