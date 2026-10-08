import { proxyToServer } from "@/lib/bff";

// 채팅 BFF. 브라우저 → (여기) → apps/server /chat.
//
// ★ 다른 BFF 와 같은 proxyToServer 를 지난다 — 세션 확인과 회원 헤더(x-navis-user)가 여기서
//   붙는다. 예전엔 직접 fetch 해서 둘 다 빠져 있었다: 로그인 없이도 대화가 됐고, 다중 사용자
//   전환 뒤에는 server 가 회원을 몰라 401 을 냈다(2026-10-08).
//
// 스트림은 파싱하지 않고 그대로 흘려보낸다(stream: true). 브라우저가 떠나면 업스트림 연결도
// 끊지만 서버는 턴을 완주한다 — 진짜 중지는 /api/chat/cancel 이 한다.
export const POST = (request: Request) => proxyToServer(request, { path: "/chat", stream: true });
