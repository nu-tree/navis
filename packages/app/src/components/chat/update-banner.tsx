import { Pressable, View } from 'react-native';
import { Text } from '../ui/text';
import { Avatar } from '../ui/avatar';
import { NAVIS_LOGO } from '../../lib/assets';
import { useDesktopUpdate } from '../../hooks/use-desktop-update';

// 클로드코드 스타일 업데이트 배너 — 입력창 바로 위에 얇게.
// 잎 아이콘 + "업데이트하려면 다시 시작" + 버전 + 화살표. 카드 전체가 누르는 영역.
export function UpdateBanner() {
  const { version, mode, install } = useDesktopUpdate();
  if (!mode) return null;

  // 클릭하면 항상 껐다 켜지며 그 자리에서 설치 → 문구도 "다시 시작"으로 통일.
  const title = '업데이트하려면 다시 시작';
  const arrow = '→';

  return (
    <View className="px-2 pb-2">
      <Pressable
        onPress={install}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 cursor-pointer active:opacity-80 hover:bg-secondary"
      >
        {/* 명시적 픽셀 크기 Avatar — raw <Image className="h-9 w-9"/> 는 web 에서
            크기가 안 먹어 원본 로고가 통째로 떠버렸다(거대 N 버그). */}
        <Avatar source={NAVIS_LOGO} size={36} className="rounded-lg bg-transparent" />
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
