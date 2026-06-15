import type { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';

// 디자인 토큰(global.css 기본 다크 팔레트)을 아이콘 색으로 매핑한다. Feather 는
// className(currentColor)을 못 받으므로 color 를 명시해야 하는데, 매번 rgb 를 적기보다
// 여기서 토큰 이름으로 통일한다(테마 추가 시 이 한 곳만 손보면 됨).
const TONE = {
  foreground: 'rgb(250,250,250)',
  'muted-foreground': 'rgb(155,156,178)',
  primary: 'rgb(99,102,241)',
  'primary-foreground': 'rgb(255,255,255)',
  destructive: 'rgb(239,68,68)',
  background: 'rgb(13,14,26)',
} as const;

export type IconName = ComponentProps<typeof Feather>['name'];
export type IconTone = keyof typeof TONE;

export function Icon({
  name,
  size = 16,
  tone = 'foreground',
}: {
  name: IconName;
  size?: number;
  tone?: IconTone;
}) {
  return <Feather name={name} size={size} color={TONE[tone]} />;
}
