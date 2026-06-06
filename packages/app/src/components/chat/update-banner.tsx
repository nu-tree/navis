import { Image, Pressable, View } from 'react-native';
import { Text } from '../ui/text';
import { NAVIS_LOGO } from '../../lib/assets';
import { useDesktopUpdate } from '../../hooks/use-desktop-update';

// 클로드코드 스타일 업데이트 배너 — 입력창 바로 위에 얇게.
// 잎 아이콘 + "업데이트하려면 다시 시작" + 버전 + 화살표. 카드 전체가 누르는 영역.
export function UpdateBanner() {
  const { version, mode, install } = useDesktopUpdate();
  if (!mode) return null;

  const title = mode === 'restart' ? '업데이트하려면 다시 시작' : '새 버전 받기';
  const arrow = mode === 'restart' ? '→' : '↓';

  return (
    <View className="px-3 pt-2">
      <Pressable
        onPress={install}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 active:opacity-80"
      >
        <Image source={NAVIS_LOGO} className="h-9 w-9 rounded-lg" />
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-foreground">{title}</Text>
          {version ? (
            <Text variant="caption" className="text-muted-foreground">
              v{version}
            </Text>
          ) : null}
        </View>
        <Text className="text-xl text-muted-foreground">{arrow}</Text>
      </Pressable>
    </View>
  );
}
