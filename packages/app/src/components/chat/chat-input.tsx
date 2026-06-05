import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { cn } from '../../lib/cn';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { useSendMessage } from '../../hooks/use-send-message';
import { useIsActiveTyping } from '../../store/chat-store';
import type { Attachment } from '../../api/navis';

export type ChatInputProps = {
  placeholder?: string;
  className?: string;
};

export function ChatInput({ placeholder = '메시지 입력…', className }: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { send } = useSendMessage();
  const typing = useIsActiveTyping();

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !typing;

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (result.canceled) return;
    const picked: Attachment[] = result.assets
      .filter((a) => a.base64)
      .map((a) => ({
        uri: a.uri,
        base64: a.base64 as string,
        mimeType: a.mimeType ?? 'image/jpeg',
      }));
    setAttachments((prev) => [...prev, ...picked].slice(0, 4));
  };

  const removeAttachment = (uri: string) =>
    setAttachments((prev) => prev.filter((a) => a.uri !== uri));

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    send(trimmed, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
  };

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
              <Image source={{ uri: a.uri }} className="h-20 w-20 rounded-xl bg-secondary" />
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
        <Input
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          multiline
          className="max-h-32 flex-1"
        />
        <Button size="icon" className="rounded-full" disabled={!canSend} onPress={submit}>
          <Text className="text-lg text-primary-foreground">↑</Text>
        </Button>
      </View>
    </View>
  );
}
