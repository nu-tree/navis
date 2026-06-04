import { Image, View, type ImageSourcePropType } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from './text';

export type AvatarProps = {
  source?: ImageSourcePropType; // 로컬 require(...) 이미지
  uri?: string; // 원격 URL
  fallback?: string; // 둘 다 없을 때 이니셜
  size?: number;
  className?: string;
};

export function Avatar({ source, uri, fallback, size = 40, className }: AvatarProps) {
  const image = source ?? (uri ? { uri } : undefined);
  return (
    <View
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-secondary',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {image ? (
        <Image source={image} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Text className="font-semibold text-secondary-foreground" style={{ fontSize: size * 0.4 }}>
          {fallback}
        </Text>
      )}
    </View>
  );
}
