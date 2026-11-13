import { proxyToServer } from "@/lib/bff";

type Params = { params: Promise<{ id: string }> };

// 이 방의 켜진 약속(2026-11-13, 오른쪽 패널).
export const GET = async (request: Request, { params }: Params) => {
  const { id } = await params;
  return proxyToServer(request, { path: `/conversations/${encodeURIComponent(id)}/promises` });
};
