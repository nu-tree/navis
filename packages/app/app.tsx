import './global.css';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatScreen } from './src/screens/chat-screen';

export default function App() {
  return (
    <SafeAreaProvider>
      <ChatScreen />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
