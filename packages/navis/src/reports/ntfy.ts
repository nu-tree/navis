import { config } from "../config.js";

// 선제 보고를 ntfy(https://ntfy.sh) 토픽으로 발행 → 폰의 ntfy 앱이 네이티브 푸시로 띄운다.
// 무료 Apple 계정이라 APNs(자체 앱 푸시)를 못 쓰는 대신, ntfy 앱이 자기네 APNs로 대신
// 밀어준다 → navis-app 이 꺼져있어도 알림이 온다(데스크톱/웹은 기존 폴링+네이티브 알림 유지).
//
// JSON 발행 모드를 쓴다: 루트 URL 로 {topic,title,message} 를 보낸다. Title 을 HTTP 헤더로
// 넣는 방식은 한글이 깨지므로(헤더는 ASCII), 본문 JSON 으로 UTF-8 을 안전히 싣는다.
//
// 설정(NTFY_TOPIC)이 없으면 조용히 no-op → 기존 동작 그대로(안전). fire-and-forget 이라
// 발행이 느리거나 실패해도 보고 기록/응답 흐름을 절대 막지 않는다.
export function publishToNtfy(title: string, message: string): void {
  const ntfy = config.ntfy;
  if (!ntfy) return;
  void fetch(ntfy.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: ntfy.topic, title, message }),
  }).catch((err) => {
    console.warn(
      "[ntfy] 발행 실패(무시):",
      err instanceof Error ? err.message : err,
    );
  });
}
