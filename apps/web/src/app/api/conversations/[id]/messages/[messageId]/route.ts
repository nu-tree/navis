import { proxyToServer } from "@/lib/bff";

type Params = { params: Promise<{ id: string; messageId: string }> };

// 중단된 질문이 남은 상태에서 다시 보내면 같은 질문이 두 번 보인다 — 하나를
// 지울 수 있어야 한다(엣지 케이스 "답 없는 질문의 연속").
export const DELETE = async (request: Request, { params }: Params) => {
  const { id, messageId } = await params;
  return proxyToServer(request, {
    path: `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,
  });
};
