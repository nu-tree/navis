"use client";

import type { Message, UsedMemory } from "@navis/validation";
import { CATEGORY_LABELS } from "@/features/memory/category";
import { useConversationMessageList } from "@/hooks/apis/conversation/use-conversation-message-list";

type Props = { conversationId: string };

/** 방금 저장 칸에 보이는 최대 수. */
const SAVED_LIMIT = 5;
/** 참고한 기억 칸에 보이는 최대 수. 더 있으면 개수만 알린다. */
const USED_LIMIT = 8;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 오른쪽 기억 패널 — 큰 화면(xl 이상)에서만. 회원 요구 "이 대화가 어떤 기억을 바탕으로 하는지 직관적으로"에 답한다.
 *
 * - 이 답에 참고한 기억: 이 방의 마지막 나비스 답이 실제로 받은 기억(memoriesUsed). 모델이 썼다고 말한 것이 아니라
 *   도구가 넘긴 것이라 지어낼 수 없다.
 * - 방금 저장: 이 방의 최근 답들이 저장한 기억(savedMemories), 최신순.
 *
 * 메시지 캐시(use-chat 이 done 때 쓴다)를 그대로 본다 — 따로 조회하지 않는다.
 */
export function MemoryPanel({ conversationId }: Readonly<Props>) {
  const { data: messages = [] } = useConversationMessageList(conversationId);
  const lastAnswer = [...messages].reverse().find((m: Message) => m.role === "assistant" && !m.origin);
  const used = lastAnswer?.memoriesUsed;
  const saved = [...messages]
    .reverse()
    .flatMap((m) => [...(m.savedMemories ?? [])].reverse())
    .slice(0, SAVED_LIMIT);

  return (
    <aside
      aria-label="이 대화의 기억"
      className="hidden w-80 shrink-0 flex-col gap-8 overflow-y-auto border-l border-sidebar-border bg-sidebar/70 px-6 py-6 xl:flex"
    >
      <section className="flex flex-col gap-3">
        <h2 className="flex items-baseline justify-between text-[13px] font-medium tracking-[0.02em] text-muted-foreground">
          <span>이 답에 참고한 기억</span>
          {used ? <span className="font-mono text-foreground/70">{used.total}</span> : null}
        </h2>
        {used?.items.length ? (
          <ul className="flex flex-col gap-2">
            {used.items.slice(0, USED_LIMIT).map((m) => (
              <MemoryCard key={m.id} memory={m} />
            ))}
            {used.total > USED_LIMIT ? (
              <li className="px-1 text-xs text-muted-foreground">외 {used.total - USED_LIMIT}개</li>
            ) : null}
          </ul>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            나비스가 기억을 찾아보고 답하면 여기에 무엇을 봤는지 보여요.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-baseline justify-between text-[13px] font-medium tracking-[0.02em] text-muted-foreground">
          <span>방금 저장</span>
          {saved.length ? <span className="font-mono text-foreground/70">{saved.length}</span> : null}
        </h2>
        {saved.length ? (
          <ul className="flex flex-col gap-2">
            {saved.map((m) => (
              <MemoryCard key={m.id} memory={m} highlight />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">이 방에서 남긴 기억이 여기에 쌓여요.</p>
        )}
      </section>
    </aside>
  );
}

function MemoryCard({ memory, highlight = false }: Readonly<{ memory: UsedMemory; highlight?: boolean }>) {
  return (
    <li
      className={
        highlight
          ? "flex flex-col gap-1.5 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3.5"
          : "flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5"
      }
    >
      <span className="flex items-center justify-between text-xs text-muted-foreground">
        <span className={memory.category ? "text-primary" : undefined}>
          {memory.category ? CATEGORY_LABELS[memory.category] : "기억"}
          {memory.project ? <span className="text-muted-foreground"> · {memory.project}</span> : null}
        </span>
        <span>{formatDate(memory.createdAt)}</span>
      </span>
      <span className="text-sm leading-relaxed text-foreground/90 text-pretty">{memory.content}</span>
    </li>
  );
}
