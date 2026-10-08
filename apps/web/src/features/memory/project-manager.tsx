"use client";

import { useState } from "react";
import { FolderCog } from "lucide-react";
import { projectKey, type ProjectSummary } from "@navis/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemoryProjectList } from "@/hooks/apis/memory/use-memory-project-list";
import { useRenameMemoryProject } from "@/hooks/apis/memory/use-rename-memory-project";

type Props = {
  /** 이름이 바뀌었다 — 필터가 옛 이름을 보고 있으면 새 이름으로 옮긴다. */
  onRenamed?: (from: string, to: string) => void;
};

/** 표기만 다른 이름끼리 묶는다 — 'soopsns' 와 'soop-sns' 는 서로의 합칠 후보다. */
const candidatesOf = (name: string, all: readonly ProjectSummary[]) =>
  all.filter((p) => p.project !== name && projectKey(p.project) === projectKey(name)).map((p) => p.project);

/** 프로젝트 이름 바꾸기 · 합치기. 이미 있는 이름으로 바꾸면 합쳐진다. */
export const ProjectManager = ({ onRenamed }: Readonly<Props>) => {
  const { data: projects = [], isLoading } = useMemoryProjectList();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <FolderCog />
          프로젝트 관리
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>프로젝트 관리</DialogTitle>
          <DialogDescription>이미 있는 이름으로 바꾸면 두 프로젝트가 하나로 합쳐집니다.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">프로젝트가 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <ProjectRow
                key={p.project}
                project={p}
                all={projects}
                {...(onRenamed ? { onRenamed } : {})}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

type RowProps = {
  project: ProjectSummary;
  all: readonly ProjectSummary[];
  onRenamed?: (from: string, to: string) => void;
};

const ProjectRow = ({ project, all, onRenamed }: Readonly<RowProps>) => {
  const { mutate: rename, isPending } = useRenameMemoryProject();
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState("");
  // 합치기는 되돌릴 수 없다 — 한 번 더 확인받는 단계.
  const [confirming, setConfirming] = useState(false);

  const candidates = candidatesOf(project.project, all);
  const target = to.trim();
  const merging = all.some((p) => p.project === target);
  const targetCount = all.find((p) => p.project === target)?.count ?? 0;

  const startEdit = (initial = "") => {
    setTo(initial);
    setConfirming(false);
    setEditing(true);
  };

  const apply = () => {
    if (!target || target === project.project) return;
    if (merging && !confirming) {
      setConfirming(true);
      return;
    }
    rename(
      { from: project.project, to: target },
      {
        onSuccess: () => {
          setEditing(false);
          onRenamed?.(project.project, target);
        },
      },
    );
  };

  return (
    <li className="space-y-2 rounded-lg border border-border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{project.project}</span>
        <span className="text-xs text-muted-foreground">
          {project.count}건 · 최근 {project.lastAt.slice(0, 10)}
        </span>
        <div className="flex-1" />
        {editing ? null : (
          <Button variant="ghost" size="sm" onClick={() => startEdit()}>
            이름 바꾸기
          </Button>
        )}
      </div>

      {candidates.length > 0 && !editing ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          표기만 다른 프로젝트:
          {candidates.map((c) => (
            <Button key={c} variant="outline" size="xs" onClick={() => startEdit(c)}>
              {c} 로 합치기
            </Button>
          ))}
        </div>
      ) : null}

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          className="space-y-2"
        >
          <Input
            autoFocus
            aria-label={`${project.project} 의 새 이름`}
            placeholder="새 이름 또는 합칠 프로젝트"
            list={`project-targets-${project.project}`}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setConfirming(false);
            }}
          />
          <datalist id={`project-targets-${project.project}`}>
            {all
              .filter((p) => p.project !== project.project)
              .map((p) => (
                <option key={p.project} value={p.project} />
              ))}
          </datalist>

          {confirming ? (
            <p className="text-sm text-destructive">
              {project.project} 기억 {project.count}건을 {target}({targetCount}건)로 합칩니다. 합친 뒤엔 어느
              기억이 원래 어느 쪽이었는지 남지 않아 되돌릴 수 없습니다.
            </p>
          ) : merging ? (
            <p className="text-xs text-muted-foreground">이미 있는 프로젝트예요 — 둘이 합쳐집니다.</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={confirming ? "destructive" : "default"}
              disabled={isPending || !target || target === project.project}
            >
              {isPending ? "처리 중…" : confirming ? "합치기" : merging ? "합치기…" : "바꾸기"}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
};
