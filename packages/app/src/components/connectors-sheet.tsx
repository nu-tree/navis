import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui/text';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { confirmDestructive } from '../lib/confirm';
import {
  fetchConnectors,
  fetchProviders,
  startOAuth,
  saveConnector,
  deleteConnector,
  type ConnectorView,
  type ProviderView,
} from '../api/connectors';

// 커넥터 관리 시트 — 연결된 목록 + OAuth 제공자 연결 + 정적 키 직접 추가.
// OAuth 동의는 브라우저(이 앱의 웹뷰/시스템 브라우저)에서 1회, 토큰 교환·갱신은 백엔드가 한다.
export function ConnectorsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [connectors, setConnectors] = useState<ConnectorView[]>([]);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>(''); // 진행 중 항목 id/key
  const [err, setErr] = useState('');

  const refresh = async () => {
    setLoading(true);
    setErr('');
    try {
      const [cs, ps] = await Promise.all([fetchConnectors(), fetchProviders()]);
      setConnectors(cs);
      setProviders(ps);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const connect = async (key: string) => {
    setBusy(key);
    setErr('');
    try {
      const authUrl = await startOAuth(key);
      await Linking.openURL(authUrl);
      // 동의는 브라우저에서 끝난다 — 돌아와서 새로고침하면 연결됨이 보인다.
    } catch (e) {
      setErr(e instanceof Error ? e.message : '연결 시작 실패');
    } finally {
      setBusy('');
    }
  };

  const remove = (c: ConnectorView) => {
    confirmDestructive({
      title: '커넥터 삭제',
      message: `${c.label} 연결을 지울까요?`,
      confirmLabel: '삭제',
      onConfirm: async () => {
        setBusy(c.id);
        try {
          await deleteConnector(c.id);
          await refresh();
        } catch (e) {
          setErr(e instanceof Error ? e.message : '삭제 실패');
        } finally {
          setBusy('');
        }
      },
    });
  };

  // 이미 연결된 제공자는 "연결" 버튼에서 숨긴다(id===key 규약).
  const connectedIds = new Set(connectors.map((c) => c.id));
  const connectable = providers.filter((p) => !connectedIds.has(p.key));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="rounded-t-2xl border border-border bg-card"
          style={{ maxHeight: '88%' }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="px-4 pt-4">
            <View className="mb-2 h-1 w-10 self-center rounded-full bg-border" />
            <View className="flex-row items-center justify-between">
              <Text variant="subtitle">커넥터</Text>
              <Pressable hitSlop={8} onPress={() => void refresh()} className="cursor-pointer active:opacity-70">
                <Text className="text-sm text-muted-foreground">{loading ? '…' : '새로고침'}</Text>
              </Pressable>
            </View>
            <Text variant="caption" className="mt-1 text-muted-foreground">
              외부 MCP 서버를 코드 수정 없이 붙여요. OAuth 는 브라우저로 한 번 동의하면 이후 자동 갱신돼요.
            </Text>
            {err ? <Text className="mt-2 text-sm text-destructive">{err}</Text> : null}
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 20 }}
          >
            {/* 연결됨 */}
            <View className="gap-2">
              <Text className="font-semibold text-foreground">연결됨</Text>
              {connectors.length === 0 ? (
                <Text variant="caption" className="text-muted-foreground">아직 없음</Text>
              ) : (
                <View className="overflow-hidden rounded-xl border border-border">
                  {connectors.map((c, i) => (
                    <View key={c.id}>
                      {i > 0 ? <View className="h-px bg-border" /> : null}
                      <View className="flex-row items-center justify-between bg-secondary px-4 py-3">
                        <View className="flex-1 pr-3">
                          <View className="flex-row items-center gap-2">
                            <Text className="font-medium text-foreground">{c.label}</Text>
                            <Text className="text-[11px] uppercase text-muted-foreground">{c.auth.type}</Text>
                            {!c.enabled ? (
                              <Text className="text-[11px] text-muted-foreground">(꺼짐)</Text>
                            ) : null}
                          </View>
                          <Text variant="caption" className="text-muted-foreground" numberOfLines={1}>
                            {c.url}
                          </Text>
                        </View>
                        <Button
                          label="삭제"
                          variant="secondary"
                          loading={busy === c.id}
                          onPress={() => remove(c)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* OAuth 제공자 연결 */}
            {connectable.length > 0 ? (
              <View className="gap-2">
                <Text className="font-semibold text-foreground">연결하기 (OAuth)</Text>
                <View className="overflow-hidden rounded-xl border border-border">
                  {connectable.map((p, i) => (
                    <View key={p.key}>
                      {i > 0 ? <View className="h-px bg-border" /> : null}
                      <View className="flex-row items-center justify-between bg-secondary px-4 py-3">
                        <View className="flex-1 pr-3">
                          <Text className="font-medium text-foreground">{p.label}</Text>
                          {!p.available ? (
                            <Text variant="caption" className="text-muted-foreground">
                              서버에 OAuth 자격(client_id) 미설정
                            </Text>
                          ) : null}
                        </View>
                        <Button
                          label="연결"
                          loading={busy === p.key}
                          disabled={!p.available}
                          onPress={() => connect(p.key)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* 정적 키 직접 추가 */}
            <StaticConnectorForm
              onSaved={refresh}
              onError={(m) => setErr(m)}
              existingIds={connectedIds}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 정적 API 키 / 공개 MCP 서버를 직접 등록하는 미니 폼.
function StaticConnectorForm({
  onSaved,
  onError,
  existingIds,
}: {
  onSaved: () => Promise<void>;
  onError: (m: string) => void;
  existingIds: Set<string>;
}) {
  const [openForm, setOpenForm] = useState(false);
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [useKey, setUseKey] = useState(true);
  const [header, setHeader] = useState('Authorization');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setId('');
    setLabel('');
    setUrl('');
    setHeader('Authorization');
    setValue('');
    setUseKey(true);
  };

  const submit = async () => {
    const slug = id.trim().toLowerCase();
    if (!/^[a-z0-9_]{1,40}$/.test(slug)) return onError('id 는 소문자/숫자/_ 만 (예: linear)');
    if (existingIds.has(slug)) return onError('이미 있는 id 예요');
    if (!/^https?:\/\//.test(url.trim())) return onError('url 은 http(s) 로 시작해야 해요');
    if (useKey && !value.trim()) return onError('API 키 값을 넣어주세요');
    setSaving(true);
    onError('');
    try {
      await saveConnector({
        id: slug,
        label: label.trim() || slug,
        url: url.trim(),
        auth: useKey
          ? { type: 'apikey', header: header.trim() || 'Authorization', value: value.trim() }
          : { type: 'none' },
      });
      reset();
      setOpenForm(false);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!openForm) {
    return (
      <Button label="+ 직접 추가 (URL + 키)" variant="secondary" onPress={() => setOpenForm(true)} />
    );
  }

  return (
    <View className="gap-2 rounded-xl border border-border p-3">
      <Text className="font-semibold text-foreground">직접 추가</Text>
      <Input value={id} onChangeText={setId} placeholder="id (예: linear)" autoCapitalize="none" />
      <Input value={label} onChangeText={setLabel} placeholder="이름 (예: Linear)" />
      <Input value={url} onChangeText={setUrl} placeholder="MCP URL (https://…/mcp)" autoCapitalize="none" />

      <Pressable
        onPress={() => setUseKey((v) => !v)}
        className="flex-row items-center justify-between rounded-xl bg-input px-4 py-3 cursor-pointer active:opacity-80"
      >
        <Text className="text-[15px] text-foreground">API 키 인증</Text>
        <View className={`h-6 w-11 rounded-full px-0.5 ${useKey ? 'bg-primary' : 'bg-secondary'} justify-center`}>
          <View className={`h-5 w-5 rounded-full bg-background ${useKey ? 'self-end' : 'self-start'}`} />
        </View>
      </Pressable>

      {useKey ? (
        <>
          <Input value={header} onChangeText={setHeader} placeholder="헤더 (기본 Authorization)" autoCapitalize="none" />
          <Input
            value={value}
            onChangeText={setValue}
            placeholder="값 (예: Bearer xxx 또는 키 원문)"
            autoCapitalize="none"
            secureTextEntry
          />
        </>
      ) : null}

      <View className="mt-1 flex-row gap-2">
        <Button
          label="취소"
          variant="secondary"
          className="flex-1"
          onPress={() => {
            reset();
            setOpenForm(false);
          }}
        />
        <Button label="추가" className="flex-1" loading={saving} onPress={submit} />
      </View>
    </View>
  );
}
