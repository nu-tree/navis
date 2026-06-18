// 코드 세션 폴더 칩 바 — 클로드 데스크톱 코드 느낌. [🖥 로컬] · [📁 폴더(=namory 프로젝트)]
// · [＋폴더] · (토큰 경고 / 정지 / ⚙️). 입력창 바로 위에 둔다. 폴더는 "세션별"이라
// active 대화의 workdir/project 를 쓰고, ＋폴더로 네이티브 다이얼로그를 열어 바꾼다.
// 폴더를 고르면 그 레포의 namory 프로젝트 기억이 연결되고(없으면 자동 생성) cwd 도 바뀐다.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BranchPicker } from '../../components/chat/branch-picker';
import { Text } from '../../components/ui/text';
import { Icon } from '../../components/ui/icon';
import { Button } from '../../components/ui/button';
import { useActiveConversation, useChatStore } from '../../store/chat-store';
import { localAgent } from '../../lib/local-agent';

// 입력창 바로 위에 붙는 코드 세션 컨텍스트 바.
export function CodeContextBar({
  onOpenSettings,
  cfgKey,
  generating,
  onStop,
  previewOpen,
  onTogglePreview,
}: {
  onOpenSettings: () => void;
  cfgKey: number;
  generating: boolean;
  onStop: () => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
}) {
  const active = useActiveConversation();
  const setCodeFolder = useChatStore((s) => s.setCodeFolder);
  const setCodeBranch = useChatStore((s) => s.setCodeBranch);
  const [hasToken, setHasToken] = useState(true);
  const [allowWrite, setAllowWrite] = useState(false);
  useEffect(() => {
    if (!localAgent) return;
    let alive = true;
    localAgent.getConfig().then((c) => {
      if (!alive) return;
      setHasToken(c.hasToken);
      setAllowWrite(c.allowWrite);
    });
    return () => {
      alive = false;
    };
  }, [cfgKey]);

  const folderName =
    active?.project || active?.workdir?.split('/').filter(Boolean).pop() || null;

  const pickFolder = async () => {
    if (!localAgent || !active) return;
    const r = await localAgent.pickFolder();
    if (r) setCodeFolder(active.id, r.workdir, r.project);
  };

  return (
    <View className="flex-row items-center gap-2 px-3 pb-2 pt-1">
      {/* 항상 로컬 — 코드는 내 맥에서 돈다(별도 토글 없음). */}
      <View className="flex-row items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-1.5">
        <Icon name="monitor" size={13} tone="foreground" />
        <Text className="text-xs font-medium text-foreground">로컬</Text>
      </View>
      {/* 폴더(=namory 프로젝트) 칩 — 누르면 폴더 선택. 기억은 이 폴더로 자동 연결/생성. */}
      <Pressable
        onPress={pickFolder}
        className="flex-row items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
      >
        <Icon name="folder" size={13} tone="foreground" />
        <Text numberOfLines={1} className="max-w-[180px] text-xs font-medium text-foreground">
          {folderName ?? '폴더 선택'}
        </Text>
        {folderName && allowWrite ? (
          <Text className="text-[10px] text-muted-foreground">· 쓰기</Text>
        ) : null}
      </Pressable>
      {/* 폴더 바꾸기 */}
      <Pressable
        onPress={pickFolder}
        hitSlop={6}
        className="flex-row items-center gap-1 rounded-lg border border-border px-2 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
      >
        <Icon name="plus" size={13} tone="muted-foreground" />
        <Text className="text-xs text-muted-foreground">폴더</Text>
      </Pressable>

      {/* 브랜치 칩 — 폴더가 선택돼 있을 때만. git 저장소가 아니면 시트에서 안내. */}
      {active?.workdir ? (
        <BranchPicker
          workdir={active.workdir}
          branch={active.branch}
          onChange={(b) => setCodeBranch(active.id, b)}
        />
      ) : null}

      <View className="flex-1" />

      {/* 미리보기 패널 토글 */}
      <Pressable
        onPress={onTogglePreview}
        hitSlop={6}
        className={`flex-row items-center gap-1 rounded-lg border px-2 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary ${previewOpen ? 'border-primary bg-primary/10' : 'border-border'}`}
      >
        <Icon name="globe" size={13} tone={previewOpen ? 'primary' : 'muted-foreground'} />
        <Text className={`text-xs font-medium ${previewOpen ? 'text-primary' : 'text-muted-foreground'}`}>
          미리보기
        </Text>
      </Pressable>

      {/* 토큰 없으면 경고(설정), 생성 중이면 정지, 아니면 ⚙️ 설정. */}
      {!hasToken ? (
        <Pressable
          onPress={onOpenSettings}
          hitSlop={6}
          className="flex-row items-center gap-1 rounded-lg border border-border px-2 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
        >
          <Icon name="alert-triangle" size={13} tone="muted-foreground" />
          <Text className="text-xs text-muted-foreground">토큰</Text>
        </Pressable>
      ) : generating ? (
        // 채팅 입력창의 중지 버튼과 동일한 모양(둥근 secondary + 빨간 호버).
        <Button
          size="icon"
          variant="secondary"
          className="rounded-full transition-colors hover:bg-destructive/20 active:bg-destructive/30"
          onPress={onStop}
        >
          <Icon name="square" size={16} tone="foreground" />
        </Button>
      ) : (
        <Pressable
          onPress={onOpenSettings}
          hitSlop={6}
          className="rounded-lg px-1.5 py-1.5 cursor-pointer active:opacity-70 hover:bg-secondary"
        >
          <Icon name="settings" size={15} tone="muted-foreground" />
        </Pressable>
      )}
    </View>
  );
}
