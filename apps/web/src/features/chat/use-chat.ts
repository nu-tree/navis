"use client";

import { useRef, useState } from "react";
import { parseChatEvents } from "@navis/api";
import type { ChatRequest, Message } from "@navis/validation";

// 한 대화방의 턴 진행 상태. 브라우저는 /api/chat(BFF)만 부른다 — apps/server 의
// 토큰은 Next 서버에만 있다.
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  // 스트리밍 중인 어시스턴트 텍스트. null 이면 진행 중인 턴이 없다.
  // 빈 문자열("")은 "턴은 시작됐지만 첫 토큰 전" — 생각 중 표시의 조건이다.
  const [streaming, setStreaming] = useState<string | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 방 id 는 첫 렌더에 한 번만 만든다(지연 초기화). 서버가 이걸로 에이전트
  // 세션을 이어 붙인다.
  const [conversationId] = useState(() => crypto.randomUUID());

  const turnId = useRef<string | null>(null);

  const send = async (text: string) => {
    if (streaming !== null) return; // 턴이 도는 중엔 새 턴을 만들지 않는다

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setStreaming("");
    setError(null);

    const id = crypto.randomUUID();
    turnId.current = id;
    // 중지 뒤 도착한 델타가 다음 턴에 섞이지 않게, 이 턴의 로컬 버퍼를 따로 둔다.
    let text_ = "";

    try {
      const body: ChatRequest = {
        conversationId,
        text,
        turnId: id,
      };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        throw new Error(await res.text().catch(() => res.statusText));
      }

      for await (const event of parseChatEvents(res.body)) {
        switch (event.type) {
          case "delta":
            text_ += event.text;
            setStreaming(text_);
            break;
          case "status":
            setTool(event.tool);
            break;
          case "done":
            // 최종 전문은 서버가 권위다 — 델타를 이어 붙인 것과 다를 수 있다.
            setMessages((prev) => [...prev, event.message]);
            break;
          case "aborted":
            // 중지 시점까지 온 부분 답변은 남긴다 — 화면에서 사라지면
            // 사용자는 무엇이 중단됐는지 알 수 없다.
            if (text_) {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  text: `${text_}\n\n⏹️ (중지됨)`,
                  createdAt: new Date().toISOString(),
                },
              ]);
            }
            break;
          case "error":
            setError(event.message);
            break;
          // thinking 은 아직 화면에 쓰지 않는다.
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(null);
      setTool(null);
      turnId.current = null;
    }
  };

  // 연결만 끊으면 서버는 계속 생성한다. 반드시 cancel 을 불러야 멈춘다.
  const stop = async () => {
    const id = turnId.current;
    if (!id) return;
    await fetch("/api/chat/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnId: id }),
    }).catch(() => {});
  };

  return { messages, streaming, tool, error, send, stop };
}
