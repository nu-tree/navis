"use client";

import { useQueryClient } from "@tanstack/react-query";
import { parseChatEvents } from "@navis/api";
import type { ChatRequest, Message } from "@navis/validation";
import type { SendInput } from "@/features/chat/chat-input";
import { useCancelChat } from "@/hooks/apis/chat/use-cancel-chat";
import { getConversationMessageListQueryOptions } from "@/hooks/apis/conversation/use-conversation-message-list";
import { getChatTurn, useChatTurn, useChatTurnStore, type ChatTurn } from "@/store/chat-turn-store";

type UseChatInput = {
  /** 이 턴이 속한 방. 서버가 이걸로 에이전트 세션을 이어 붙인다. */
  conversationId: string;
  /** 턴이 끝난 뒤. 방 목록 갱신에 쓴다. */
  onTurnEnd?: () => void;
};

/** 서버가 거절한 요청. 문구가 사람이 읽을 수 있게 정리돼 있다. */
class ChatRequestError extends Error {}

/**
 * 실패 응답 → 사람이 읽을 문구. BFF · server 는 `{ error: "..." }` 로 답한다 — 그 문구를 쓰고,
 * 원문(JSON 등)은 콘솔에만 남긴다.
 */
const failureMessage = async (res: Response): Promise<string> => {
  const raw = await res.text().catch(() => "");
  console.error(`[use-chat] ${res.status} ${raw}`);
  if (res.status === 401) return "로그인이 필요합니다.";
  try {
    const { error } = JSON.parse(raw) as { error?: unknown };
    if (typeof error === "string" && error) return error;
  } catch {
    // JSON 이 아니면 아래 기본 문구.
  }
  return "응답을 받지 못했습니다. 잠시 뒤 다시 시도해주세요.";
};

// 한 대화방의 턴. 브라우저는 /api/chat(BFF)만 부른다 — apps/server 의 토큰은
// Next 서버에만 있다.
//
// 턴 상태는 이 훅이 아니라 store/chat-turn-store.ts 가 방별로 들고 있다. 방을 옮겨도
// 스트림은 끝까지 읽히고, 돌아오면 같은 상태가 다시 보인다.
//
// 메시지는 그 방의 쿼리 캐시에 직접 쓴다. 패널이 닫혀 있어도 캐시는 살아 있으므로, 다른 방에
// 가 있는 사이 끝난 답도 그 방 캐시에 들어가 돌아오면 바로 보인다.
export function useChat({ conversationId, onTurnEnd }: UseChatInput) {
  const queryClient = useQueryClient();
  const { mutate: cancelChat } = useCancelChat();
  const { streaming, tool, error, errorCode, turnId } = useChatTurn(conversationId);
  // 스트림 루프는 렌더 밖에서 돈다 — 구독 없이 getState() 로 읽고 쓴다.
  const update = (patch: Partial<ChatTurn>) =>
    useChatTurnStore.getState().update(conversationId, patch);

  const messageListOptions = getConversationMessageListQueryOptions(conversationId);

  const append = (...incoming: Message[]) =>
    queryClient.setQueryData(messageListOptions.queryKey, (old = []) => [...old, ...incoming]);

  /**
   * 질문을 붙이기 전에 진행 중인 목록 조회와 순서를 맞춘다. 안 맞추면 늦게 도착한 조회 결과가
   * 캐시를 통째로 덮어 방금 보낸 질문이 사라진다.
   *
   * - 아직 받아온 게 없다(처음 여는 방): 그 조회를 **기다린다**. 취소하면 이전 대화가 안 보인다.
   * - 이미 있다(다시 연 방의 재조회): **취소한다**. 이 탭에서 오간 메시지는 이미 캐시에 있다.
   */
  const syncMessageList = async () => {
    if (queryClient.getQueryData(messageListOptions.queryKey) === undefined) {
      // 진행 중인 조회가 있으면 그 결과를 함께 기다린다(중복 요청을 만들지 않는다).
      await queryClient.ensureQueryData(messageListOptions).catch(() => undefined);
    } else {
      await queryClient.cancelQueries({ queryKey: messageListOptions.queryKey });
    }
  };

  const send = async ({ text, images, model }: SendInput) => {
    // 이 방에서 턴이 도는 중엔 새 턴을 만들지 않는다. 다른 방은 상관없다.
    if (getChatTurn(conversationId).streaming !== null) return;

    const id = crypto.randomUUID();
    // 진행 중 표시를 먼저 켠다 — 아래 await 사이에 한 번 더 눌러도 두 번 보내지 않는다.
    update({ streaming: "", tool: null, error: null, errorCode: null, turnId: id });

    await syncMessageList();
    append({
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: new Date().toISOString(),
      // 화면에 첨부를 보여주기 위해서만 담는다 — 서버는 저장 시 비운다.
      ...(images?.length ? { images } : {}),
    });

    // 중지 뒤 도착한 델타가 다음 턴에 섞이지 않게, 이 턴의 로컬 버퍼를 따로 둔다.
    let text_ = "";
    // 조각마다 화면에 반영하면 조각마다 답 전체의 마크다운을 다시 해석한다(답 길이의 제곱).
    // 화면 갱신 주기에 한 번만 반영한다 — 조각이 아무리 잘게 와도 초당 최대 60번이다.
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      update({ streaming: text_ });
    };
    const cancelFlush = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    try {
      const body: ChatRequest = {
        conversationId,
        text,
        turnId: id,
        ...(images?.length ? { images } : {}),
        ...(model ? { model } : {}),
      };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new ChatRequestError(await failureMessage(res));

      for await (const event of parseChatEvents(res.body)) {
        switch (event.type) {
          case "delta":
            text_ += event.text;
            frame ??= requestAnimationFrame(flush);
            break;
          case "status":
            update({ tool: event.tool });
            break;
          case "done":
            cancelFlush();
            // 최종 전문은 서버가 권위다 — 델타를 이어 붙인 것과 다를 수 있다.
            // message 에 saved 가 실려 오므로 저장 표시도 여기서 함께 확정된다.
            append(event.message);
            break;
          case "aborted":
            cancelFlush();
            // 중지 시점까지 온 부분 답변은 화면에 남긴다 — 사라지면 사용자는
            // 무엇이 중단됐는지 알 수 없다.
            //
            // ★ 다만 **서버에 기록되지는 않는다**(FR-004, Q3=B). 방을 다시 열면
            //   사라지고 질문만 남는다. 그래서 이 메시지에는 id 를 새로 만들어
            //   붙이지만, 서버의 어떤 메시지와도 대응되지 않는다 — 삭제 버튼이
            //   404 를 받아도 정상이다.
            if (text_) {
              append({
                id: crypto.randomUUID(),
                role: "assistant",
                text: `${text_}\n\n⏹️ (중지됨)`,
                createdAt: new Date().toISOString(),
              });
            }
            break;
          case "error":
            update({ error: event.message, errorCode: event.code ?? null });
            break;
          // thinking 은 아직 화면에 쓰지 않는다.
        }
      }
    } catch (err) {
      // 연결 자체가 끊긴 경우(fetch 의 TypeError 등)는 원문이 사람에게 의미가 없다.
      console.error("[use-chat]", err);
      update({
        error: err instanceof ChatRequestError ? err.message : "연결이 끊겼습니다. 다시 시도해주세요.",
      });
    } finally {
      // ★ 예약된 반영을 먼저 지운다. 아래에서 턴을 끝낸 뒤 그게 돌면 끝난 턴이
      //   "스트리밍 중"으로 되살아난다.
      cancelFlush();
      // 오류는 남긴다 — 방을 떠난 사이 실패했어도 돌아와서 볼 수 있어야 한다.
      update({ streaming: null, tool: null, turnId: null });
      // 목록의 제목·마지막 메시지·정렬을 갱신한다.
      onTurnEnd?.();
    }
  };

  const stop = () => {
    if (turnId) cancelChat(turnId);
  };

  return { streaming, tool, error, errorCode, send, stop };
}
