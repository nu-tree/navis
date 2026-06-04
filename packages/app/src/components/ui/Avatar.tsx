import { Image, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from './Text';

export type AvatarProps = {
  uri?: string;
  fallback?: string; // 이미지 없을 때 이니셜
  size?: number;
  className?: string;
};

export function Avatar({ uri, fallback, size = 40, className }: AvatarProps) {
  return (
    <View
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-secondary',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <Text className="font-semibold text-secondary-foreground" style={{ fontSize: size * 0.4 }}>
          {fallback}
        </Text>
      )}
    </View>
  );
}
