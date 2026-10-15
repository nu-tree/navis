"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { RelayComposer } from "@/hooks/pages/relay/use-relay-composer";

type Props = { composer: RelayComposer };

/** 받는 사람 · 전할 말 · 보내기. 판단은 useRelayComposer 가 한다. */
export const RelayForm = ({ composer }: Readonly<Props>) => {
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    composer.send();
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card/40 p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">말 걸기</h2>
        <p className="text-sm text-muted-foreground">
          전할 말을 적으면 그 사람의 나비스가 그 사람에게 맞게 다듬어 먼저 말을 걸어요. 누가 보냈는지는 밝히지 않아요 —
          밝히고 싶으면 <b className="font-medium text-foreground">“내가 전했다고 해줘”</b>를 함께 적어 주세요.
        </p>
      </div>

      {composer.membersLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : composer.membersError ? (
        <p className="text-sm text-destructive">{composer.membersError.message}</p>
      ) : (
        <Select value={composer.recipientId} onValueChange={composer.setRecipientId}>
          <SelectTrigger aria-label="받는 사람" className="w-full">
            <SelectValue placeholder="받는 사람" />
          </SelectTrigger>
          <SelectContent>
            {composer.members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Textarea
        aria-label="전할 말"
        placeholder="예: 내일 10시 회의가 11시로 바뀌었다고 알려줘"
        value={composer.instruction}
        maxLength={composer.maxLength}
        onChange={(e) => composer.setInstruction(e.target.value)}
        className="min-h-24"
      />

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          {composer.instruction.length}/{composer.maxLength}
        </span>
        <Button type="submit" disabled={!composer.canSend}>
          <Send />
          {composer.sending ? "보내는 중…" : "보내기"}
        </Button>
      </div>
    </form>
  );
};
