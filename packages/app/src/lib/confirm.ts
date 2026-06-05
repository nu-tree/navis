import { Alert, Platform } from 'react-native';

// 파괴적 동작(삭제 등) 확인 다이얼로그.
// 네이티브(iOS/Android)는 Alert.alert, 웹/데스크톱은 Alert가 no-op 이라
// window.confirm 으로 분기한다(둘 다 안 되면 그냥 진행하지 않음).
export function confirmDestructive(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`${opts.title}\n\n${opts.message}`)) opts.onConfirm();
    }
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: '취소', style: 'cancel' },
    { text: opts.confirmLabel, style: 'destructive', onPress: opts.onConfirm },
  ]);
}
