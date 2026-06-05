import './global.css';

import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatScreen } from './src/screens/chat-screen';
import { MemoriesScreen } from './src/screens/memories-screen';
import { ProjectsScreen } from './src/screens/projects-screen';
import { useUiStore } from './src/store/ui-store';

const queryClient = new QueryClient();

function Root() {
  const screen = useUiStore((s) => s.screen);
  if (screen === 'memories') return <MemoriesScreen />;
  if (screen === 'projects') return <ProjectsScreen />;
  return <ChatScreen />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Root />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
