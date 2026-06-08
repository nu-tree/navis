import { useCallback, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputProps,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { useSendMessage } from '../../hooks/use-send-message';
import { useIsActiveTyping } from '../../store/chat-store';
import type { Attachment } from '../../api/navis';

// 첨부 최대 개수 — pickImage(selectionLimit), 붙여넣기, 합산 모두 이 한도에 맞춘다.
const MAX_ATTACHMENTS = 4;

// 브라우저 File → Attachment(base64). 데이터 URL 의 ',' 뒤가 base64 본문.
const fileToAttachment = (file: File): Promise<Attachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 실패'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : '';
      resolve({
        uri: result,
        base64,
        mimeType: file.type || 'image/png',
      });
    };
    reader.readAsDataURL(file);
  });

export type ChatInputProps = {
  placeholder?: string;
  className?: string;
};

// 입력창 자동 성장 범위 — 내용에 맞춰 커지다 MAX 를 넘으면 그때 내부 스크롤.
const MIN_INPUT_H = 44;
const MAX_INPUT_H = 200;
const INPUT_PAD_V = 10;
const INPUT_PAD_H = 16;

export function ChatInput({ placeholder = '메시지 입력…', className }: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_H);
  const { send } = useSendMessage();
  const typing = useIsActiveTyping();

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !typing;

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: MAX_ATTACHMENTS,
    });
    if (result.canceled) return;
    const picked: Attachment[] = result.assets
      .filter((a) => a.base64)
      .map((a) => ({
        uri: a.uri,
        base64: a.base64 as string,
        mimeType: a.mimeType ?? 'image/jpeg',
      }));
    setAttachments((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
  };

  const removeAttachment = (uri: string) =>
    setAttachments((prev) => prev.filter((a) => a.uri !== uri));

  // 클립보드 이미지 붙여넣기(웹/데스크톱 전용). RN 모바일 텍스트 입력에선 paste 이벤트가
  // 노출되지 않아 무시한다. text 만 있는 paste 는 그대로 흘려보내 텍스트 붙여넣기 동작 유지.
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLElement>) => {
    if (Platform.OS !== 'web') return;
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    void Promise.all(files.map(fileToAttachment))
      .then((picked) => {
        setAttachments((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
      })
      .catch(() => {
        /* 읽기 실패는 조용히 무시 — 사용자가 다시 시도 가능 */
      });
  }, []);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    send(trimmed, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    setInputHeight(MIN_INPUT_H);
  };

  // 데스크톱/웹: Enter 전송, Shift+Enter 줄바꿈. 네이티브 모바일은 기본(줄바꿈) 유지.
  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== 'web') return;
    const ne = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (ne.key === 'Enter' && !ne.shiftKey) {
      e.preventDefault?.();
      if (canSend) submit();
    }
  };

  const clampedHeight = Math.min(Math.max(MIN_INPUT_H, inputHeight), MAX_INPUT_H);

  // 모바일(iOS/Android) 의 multiline TextInput 은 인라인 고정 height 를 주면
  // 레이아웃이 그 높이에 갇혀 onContentSizeChange 의 contentSize.height 가 자라지 않는
  // 알려진 RN 버그가 있다. 모바일에선 minHeight/maxHeight 만 주고 자연 성장에 맡기고,
  // 웹(react-native-web → <textarea>) 은 직접 height 를 갱신해야 늘어나므로 그대로 둔다.
  const heightStyle =
    Platform.OS === 'web'
      ? { height: clampedHeight }
      : { minHeight: MIN_INPUT_H, maxHeight: MAX_INPUT_H };

  // react-native-web 은 TextInput 에 넘긴 onPaste 를 그대로 textarea DOM 으로 전달한다.
  // RN 타입엔 onPaste 가 없어 Partial<TextInputProps> 로 캐스팅해 끼워 넣는다.
  const webOnlyProps: Partial<TextInputProps> =
    Platform.OS === 'web'
      ? ({ onPaste: handlePaste } as unknown as Partial<TextInputProps>)
      : {};

  return (
    <View className={cn('border-t border-border bg-background', className)}>
      {attachments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="max-h-24"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 10 }}
        >
          {attachments.map((a) => (
            <View key={a.uri} className="relative">
              <Image
                source={{ uri: a.uri }}
                className="rounded-xl bg-secondary"
                style={{ width: 80, height: 80 }}
              />
              <Pressable
                onPress={() => removeAttachment(a.uri)}
                className="absolute -right-1.5 -top-1.5 h-6 w-6 items-center justify-center rounded-full bg-foreground"
              >
                <Text className="text-xs font-bold text-background">✕</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View className="flex-row items-end gap-2 px-3 py-2">
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full"
          disabled={typing}
          onPress={pickImage}
        >
          <Text className="text-xl text-foreground">＋</Text>
        </Button>
        {/* Input 래퍼(min-h-11 + py-2.5) 를 거치지 않고 TextInput 을 직접 사용.
            iOS 에서 wrapper className 의 minHeight/padding 이 인라인 style.height 와 충돌해
            44px 에 갇히던 버그를 회피한다. height/padding 을 인라인으로 한 번에 지정하고
            textAlignVertical='top' 으로 멀티라인 렌더링을 안정화. */}
        <TextInput
          {...webOnlyProps}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#6b7280"
          multiline
          textAlignVertical="top"
          onKeyPress={handleKeyPress}
          onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
          // MAX 도달 전엔 내부 스크롤 끄고(그냥 성장), 도달하면 그때부터 스크롤.
          // Android 의 contentSize.height 는 padding 을 포함해서 보고하지만, 약간 빨리
          // 스크롤로 전환되는 정도라 기능상 문제 없음.
          scrollEnabled={inputHeight >= MAX_INPUT_H}
          style={{
            flex: 1,
            ...heightStyle,
            paddingHorizontal: INPUT_PAD_H,
            paddingTop: INPUT_PAD_V,
            paddingBottom: INPUT_PAD_V,
            fontSize: 15,
          }}
          className="rounded-xl bg-input text-foreground"
        />
        <Button size="icon" className="rounded-full" disabled={!canSend} onPress={submit}>
          <Text className="text-lg text-primary-foreground">↑</Text>
        </Button>
      </View>
    </View>
  );
}
