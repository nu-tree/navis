"use client";

import type { Message, PromiseItem, UsedMemory } from "@navis/validation";
import { useEffect } from "react";
import { AlarmClock } from "lucide-react";
import { PineRow } from "@/components/decor/winter-scene";
import { CATEGORY_LABELS } from "@/features/memory/category";
import { useConversationMessageList } from "@/hooks/apis/conversation/use-conversation-message-list";
import { useConversationPromiseList } from "@/hooks/apis/conversation/use-conversation-promise-list";

type Props = { conversationId: string };

/** 방금 저장 칸에 보이는 최대 수. */
const SAVED_LIMIT = 5;
/** 참고한 기억 칸에 보이는 최대 수. 더 있으면 개수만 알린다. */
const USED_LIMIT = 8;

/** 다음 실행 시각 — "11/14 오전 9:00". */
const formatNext = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
};

const describeSchedule = (p: PromiseItem) => (p.schedule.kind === "cron" ? p.schedule.description : "한 번");

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
 * - 이 방의 약속: 이 방으로 올 켜진 약속(만든 방 기준, 메인 방은 갈 곳 잃은 약속까지).
 *
 * 메시지 캐시(use-chat 이 done 때 쓴다)를 그대로 본다 — 따로 조회하지 않는다.
 */
export function MemoryPanel({ conversationId }: Readonly<Props>) {
  const { data: messages = [] } = useConversationMessageList(conversationId);
  const { data: promises = [], refetch: refetchPromises } = useConversationPromiseList(conversationId);
  // 답이 하나 늘면(약속을 만들었을 수 있다) 약속을 다시 받는다.
  const answers = messages.filter((m) => m.role === "assistant").length;
  useEffect(() => {
    void refetchPromises();
  }, [answers, refetchPromises]);
  const lastAnswer = [...messages].reverse().find((m: Message) => m.role === "assistant" && !m.origin);
  const used = lastAnswer?.memoriesUsed;
  const saved = [...messages]
    .reverse()
    .flatMap((m) => [...(m.savedMemories ?? [])].reverse())
    .slice(0, SAVED_LIMIT);

  return (
    <aside
      aria-label="이 대화의 기억"
      className="relative z-10 hidden w-80 shrink-0 flex-col gap-8 overflow-y-auto border-l border-sidebar-border bg-sidebar/70 px-6 py-6 xl:flex"
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

      <section className="flex flex-col gap-3">
        <h2 className="flex items-baseline justify-between text-[13px] font-medium tracking-[0.02em] text-muted-foreground">
          <span>이 방의 약속</span>
          {promises.length ? <span className="font-mono text-foreground/70">{promises.length}</span> : null}
        </h2>
        {promises.length ? (
          <ul className="flex flex-col gap-2">
            {promises.map((p) => (
              <li key={p.id} className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5">
                <AlarmClock className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{p.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {describeSchedule(p)}
                    {p.nextRunAt ? ` · 다음 ${formatNext(p.nextRunAt)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            &lsquo;내일 9시에 알려줘&rsquo;처럼 맡기면 여기에 보이고, 때가 되면 이 방으로 와요.
          </p>
        )}
      </section>

      {/* 맨 아래 흰 숲(레퍼런스 오른쪽 위의 흰 나무). 내용이 적으면 바닥에, 많으면 맨 끝에 놓인다. */}
      <PineRow tone="snow" className="-mx-6 -mb-6 mt-auto h-28 w-[calc(100%+3rem)] shrink-0 opacity-20" />
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
