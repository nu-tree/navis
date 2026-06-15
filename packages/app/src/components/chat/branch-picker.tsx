import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { localAgent } from '../../lib/local-agent';
import { Text } from '../ui/text';
import { Icon } from '../ui/icon';
import { Separator } from '../ui/separator';

// 코드 세션의 git 브랜치 칩 + 선택 바텀시트. 폴더가 git 저장소일 때만 의미 있다.
// 누르면 브랜치 목록을 조회해 보여주고, 고르면 체크아웃 후 onChange 로 알린다.
export function BranchPicker({
  workdir,
  branch,
  onChange,
}: {
  workdir: string;
  branch?: string;
  onChange: (branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(branch ?? null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모듈 const 는 클로저 안에서 narrowing 이 유지되지 않아 로컬로 캡처한다.
  const agent = localAgent;
  if (!agent) return null;

  const openSheet = async () => {
    setOpen(true);
    setError(null);
    setLoading(true);
    try {
      const r = await agent.listBranches(workdir);
      setBranches(r.branches);
      if (r.current) setCurrent(r.current);
    } finally {
      setLoading(false);
    }
  };

  const pick = async (b: string) => {
    if (b === current) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await agent.checkoutBranch(workdir, b);
    setBusy(false);
    if (r.ok) {
      setCurrent(b);
      onChange(b);
      setOpen(false);
    } else {
      // 더티 트리·충돌 등 — 시트를 닫지 않고 에러를 보여준다.
      setError(r.error ?? '체크아웃 실패');
    }
  };

  const shown = current ?? branch ?? '브랜치';

  return (
    <>
      <Pressable
        onPress={openSheet}
        className="flex-row items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
      >
        <Icon name="git-branch" size={13} tone="foreground" />
        <Text numberOfLines={1} className="max-w-[140px] text-xs font-medium text-foreground">
          {shown}
        </Text>
        <Icon name="chevron-down" size={13} tone="muted-foreground" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
          <Pressable
            className="max-h-[70%] rounded-t-2xl border border-border bg-card pb-6 pt-2"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-1 h-1 w-10 self-center rounded-full bg-border" />
            <Text className="px-5 py-2 text-xs font-semibold text-muted-foreground">
              브랜치 {busy ? '· 전환 중…' : ''}
            </Text>

            {error ? (
              <Text className="px-5 pb-2 text-xs text-destructive">{error}</Text>
            ) : null}

            {loading ? (
              <Text className="px-5 py-3 text-sm text-muted-foreground">불러오는 중…</Text>
            ) : branches.length === 0 ? (
              <Text className="px-5 py-3 text-sm text-muted-foreground">
                git 저장소가 아니거나 브랜치가 없어
              </Text>
            ) : (
              <View>
                {branches.map((b, i) => {
                  const active = b === current;
                  return (
                    <View key={b}>
                      {i > 0 ? <Separator /> : null}
                      <Pressable
                        onPress={() => pick(b)}
                        disabled={busy}
                        className="flex-row items-center justify-between px-5 py-3.5 active:bg-secondary"
                      >
                        <Text className={active ? 'font-semibold text-primary' : 'text-foreground'}>
                          {b}
                        </Text>
                        {active ? <Icon name="check" size={16} tone="primary" /> : null}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
