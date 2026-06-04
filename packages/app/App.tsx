import './global.css';

import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-neutral-950">
      <Text className="text-4xl font-bold tracking-wide text-white">navis</Text>
      <Text className="text-sm text-neutral-400">제2의 뇌 · 모바일 클라이언트</Text>
      <StatusBar style="light" />
    </View>
  );
}
