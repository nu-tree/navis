import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Text } from '../ui/text';

type Props = {
  url: string;
  onUrlChange: (url: string) => void;
  onClose: () => void;
};

// Electron 렌더러에서 <webview> 태그를 JSX 로 쓸 수 있게 타입 선언.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          style?: React.CSSProperties;
          allowpopups?: boolean;
        },
        HTMLElement
      >;
    }
  }
}

export function PreviewPanel({ url, onUrlChange, onClose }: Props) {
  const [inputVal, setInputVal] = useState(url);
  const webviewRef = useRef<HTMLElement | null>(null);

  // url prop 이 외부에서 바뀌면 입력창도 갱신.
  useEffect(() => {
    setInputVal(url);
  }, [url]);

  const navigate = (target: string) => {
    let normalized = target.trim();
    if (!normalized) return;
    // 스킴 없으면 http 붙이기
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'http://' + normalized;
    }
    onUrlChange(normalized);
    setInputVal(normalized);
  };

  const reload = () => {
    const wv = webviewRef.current as unknown as { reload?: () => void };
    wv?.reload?.();
  };

  // Electron 환경에서만 <webview>, 웹(개발 중)에선 <iframe>
  const isElectron = Platform.OS === 'web' && typeof window !== 'undefined' && 'navisLocal' in window;

  return (
    <View className="flex-1 flex-col border-l border-border bg-background">
      {/* URL 바 */}
      <View className="flex-row items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
        <Pressable onPress={reload} hitSlop={6} className="px-1 cursor-pointer hover:opacity-70">
          <Text className="text-sm text-muted-foreground">↺</Text>
        </Pressable>
        {/* URL 입력 */}
        <View className="flex-1 rounded-md border border-border bg-background px-2 py-1">
          <TextInput
            value={inputVal}
            onChangeText={setInputVal}
            onSubmitEditing={() => navigate(inputVal)}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ fontSize: 12, color: 'var(--foreground)', outlineStyle: 'none' } as never}
            placeholder="localhost:8081"
            placeholderTextColor="var(--muted-foreground)"
          />
        </View>
        <Pressable onPress={onClose} hitSlop={6} className="px-1 cursor-pointer hover:opacity-70">
          <Text className="text-sm text-muted-foreground">✕</Text>
        </Pressable>
      </View>

      {/* 미리보기 */}
      <View className="flex-1">
        {url ? (
          isElectron ? (
            // Electron: <webview> — 진짜 브라우저 엔진, CSP/X-Frame 무시
            <webview
              ref={webviewRef as React.RefObject<HTMLElement>}
              src={url}
              allowpopups={true}
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : (
            // 웹 개발 환경: iframe (동일 출처 시 작동)
            <iframe
              src={url}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="preview"
            />
          )
        ) : (
          <View className="flex-1 items-center justify-center gap-3">
            <Text className="text-3xl">🌐</Text>
            <Text variant="caption" className="text-center text-muted-foreground">
              위 주소창에 URL 입력 후 Enter{'\n'}(예: localhost:8081)
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
