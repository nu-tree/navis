import { proxyToServer } from "@/lib/bff";

type Params = { params: Promise<{ id: string }> };

// 이전 메시지 한 페이지(specs/003 FR-026). 쿼리(before · limit)는 proxyToServer 가 그대로 넘긴다.
export const GET = async (request: Request, { params }: Params) => {
  const { id } = await params;
  return proxyToServer(request, { path: `/conversations/${encodeURIComponent(id)}/messages` });
};
