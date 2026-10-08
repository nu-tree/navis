import type { ChatEvent } from "@navis/validation";
import { chatEventSchema } from "@navis/validation";

// SSE 프레임 → 타입 있는 채팅 이벤트.
//
// 토큰을 모르는 순수 파서라 브라우저에서도 쓴다 — 웹은 BFF(/api/chat)가 서버의
// 스트림을 그대로 흘려보내므로, 파싱 규칙이 서버·클라 양쪽에서 같아야 한다.
export async function* parseChatEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 프레임 구분은 빈 줄. 마지막 조각은 미완성이므로 버퍼에 남긴다.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      if (!data) continue; // `: ping` 같은 주석 프레임
      let json: unknown;
      try {
        json = JSON.parse(data);
      } catch {
        // 깨진 프레임 하나 때문에 스트림 전체를 끊지 않는다 — 그 프레임만 건너뛴다.
        continue;
      }
      const parsed = chatEventSchema.safeParse(json);
      // 모르는 이벤트는 조용히 버린다 — 서버가 새 이벤트를 추가해도
      // 구버전 클라이언트가 깨지지 않게.
      if (parsed.success) yield parsed.data;
    }
  }
}
