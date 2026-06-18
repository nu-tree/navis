// ── 프롬프트 입력 조립 ────────────────────────────────────────────────────────
// 역할: askClaude 가 SDK query() 에 넘길 prompt 입력을 만든다. 너지 키워드 →
// history 합성 → 이미지가 있으면 user content block 배열로 감싼 async iterable.
// askClaude 안에 인라인으로 흩어져 있던 조립 단계를 한 곳에 모아 가독성을 높이고,
// 워밍 경로가 이 단계를 우회한다는 사실도 한눈에 보이게 한다.

import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { applySaveNudge } from "../nudge.js";
import type { InputImage } from "../types.js";

// askClaude 의 프롬프트 조립을 한 곳에 모은다: 너지 키워드 → history 합성 → 이미지가
// 있으면 user content block 배열로 감싼 async iterable. 옛 askClaude 안에서 인라인으로
// 흩어져 있어 가독성이 낮았고, 워밍 경로가 이 단계를 우회한다는 사실도 한눈에 안 보였다.
// 반환은 SDK 가 받는 string 또는 AsyncIterable<SDKUserMessage> 둘 중 하나.
export function buildPromptInput(opts: {
  prompt: string;
  historyContext?: string;
  images?: InputImage[];
}): string | AsyncGenerator<SDKUserMessage> {
  // 키워드 너지(B): 사용자 메시지에 결정/약속/할 일/배움 신호가 보이면 메인 턴에도
  // save 호출을 상기시키는 가벼운 힌트를 앞에 붙인다. 사후 큐레이터(A)가 그물이지만
  // 메인 턴에서 잡으면 응답 흐름 안에서 자연스럽게 저장돼 UX가 매끄럽다.
  const nudgedPrompt = applySaveNudge(opts.prompt);

  // historyContext 는 사용자가 아닌 채널 로그라 nudge 키워드 매칭 대상이 아니다.
  // 그래서 nudge 적용 후에 합친다.
  const promptWithHistory = opts.historyContext
    ? `[참고: 이 채널의 최근 메시지 — 'navis' 는 너 자신의 직전 발화/자동 보고. 새 세션이라 맥락 보강용으로 붙여둠. 사용자의 이번 질문은 아래 "[현재 메시지]" 블록.]\n${opts.historyContext}\n\n[현재 메시지]\n${nudgedPrompt}`
    : nudgedPrompt;

  // 이미지가 있으면 content block 배열로 구성해 user 메시지 하나를 yield 한다.
  // 없으면 기존처럼 문자열 prompt 그대로(가장 단순한 경로).
  const images = opts.images ?? [];
  return images.length > 0 ? buildImageMessage(promptWithHistory, images) : promptWithHistory;
}

// 텍스트(있으면) + 이미지들을 하나의 user 메시지로 묶어 yield 하는 async generator.
// query()의 streaming-input 모드는 prompt로 AsyncIterable<SDKUserMessage>를 받는다.
async function* buildImageMessage(
  text: string,
  images: InputImage[],
): AsyncGenerator<SDKUserMessage> {
  const content = [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType,
        data: img.data,
      },
    })),
  ];

  yield {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
  };
}
