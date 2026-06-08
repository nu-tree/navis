import './global.css';

import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SafeAreaInsetsContext,
  SafeAreaFrameContext,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { ChatScreen } from './src/screens/chat-screen';
import { MemoriesScreen } from './src/screens/memories-screen';
import { ProjectsScreen } from './src/screens/projects-screen';
import { SettingsScreen } from './src/screens/settings-screen';
import { SpaceBackground } from './src/components/space-background';
import { useUiStore } from './src/store/ui-store';
import { useThemeStore } from './src/store/theme-store';
import { THEME_VARS } from './src/lib/theme';
import { TITLEBAR_INSET } from './src/lib/desktop';

const queryClient = new QueryClient();

// 정적 안전영역(safe-area) 값 — 네이티브 inset 이벤트를 구독하는 SafeAreaProvider 대체.
// react-native-safe-area-context 의 SafeAreaProvider 는 네이티브 이벤트 이미터로 inset
// 변화를 수신하는데, New Architecture(bridgeless)에서 그 이벤트가 JS 의 RCTEventEmitter
// 등록 전에 발사돼 "RCTEventEmitter.receiveEvent ... not registered as callable" 로 앱이
// 시작 즉시 크래시한다(iOS). 시작 시 1회 측정된 initialWindowMetrics 로 inset 을 정적
// 제공하면(폰은 보통 세로 고정이라 충분) 네이티브 구독이 없어져 레이스가 사라진다.
const SAFE_INSETS = initialWindowMetrics?.insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
const SAFE_FRAME = initialWindowMetrics?.frame ?? { x: 0, y: 0, width: 0, height: 0 };

// macOS 데스크톱: 네이티브 타이틀바를 숨겼으므로(hiddenInset) 창을 마우스로 옮길
// 영역이 사라진다. 콘텐츠 위쪽 TITLEBAR_INSET 만큼 투명한 드래그 띠를 깔아
// 트래픽 라이트 옆 빈 공간을 잡고 창을 이동할 수 있게 한다(react-native-web 으로는
// -webkit-app-region 을 줄 수 없어 DOM 으로 직접 주입). 다른 환경에선 no-op.
function DesktopDragBar() {
  useEffect(() => {
    if (!TITLEBAR_INSET) return;
    const doc = (globalThis as any).document;
    if (!doc) return;
    const el = doc.createElement('div');
    el.setAttribute('data-navis-dragbar', '');
    el.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      `height:${TITLEBAR_INSET}px`,
      'z-index:9999',
      '-webkit-app-region:drag',
      'app-region:drag',
    ].join(';');
    doc.body.appendChild(el);
    return () => el.remove();
  }, []);
  return null;
}

function Screen() {
  const screen = useUiStore((s) => s.screen);
  if (screen === 'memories') return <MemoriesScreen />;
  if (screen === 'projects') return <ProjectsScreen />;
  if (screen === 'settings') return <SettingsScreen />;
  return <ChatScreen />;
}

function Root() {
  const theme = useThemeStore((s) => s.theme);
  return (
    // 테마 변수를 루트에서 주입 → 하위 트리의 시맨틱 토큰이 교체된다(웹/네이티브 공용).
    <View style={[{ flex: 1 }, THEME_VARS[theme]]} className="flex-1 bg-background">
      {/* 다크 테마에서만 별밤 배경(콘텐츠 뒤, 터치 통과) */}
      {theme === 'dark' ? <SpaceBackground /> : null}
      {/* 데스크톱(macOS)에선 숨긴 타이틀바의 트래픽 라이트 자리만큼 콘텐츠를 내린다. */}
      <View className="flex-1" style={{ paddingTop: TITLEBAR_INSET }}>
        <Screen />
      </View>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <DesktopDragBar />
    </View>
  );
}

export default function App() {
  // react-native-safe-area-context 의 네이티브 inset 이벤트가 New Architecture(bridgeless)
  // 초기화 레이스로 시작 즉시 크래시("RCTEventEmitter.receiveEvent ... not registered as
  // callable")를 일으킨다(iOS). SafeAreaProvider 마운트를 첫 프레임 뒤(= RCTEventEmitter
  // 등록 완료 후)로 한 틱 미뤄 레이스를 피한다. 비어 있는 첫 프레임은 사실상 안 보인다.
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaFrameContext.Provider value={SAFE_FRAME}>
        <SafeAreaInsetsContext.Provider value={SAFE_INSETS}>
          <Root />
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>
    </QueryClientProvider>
  );
}
