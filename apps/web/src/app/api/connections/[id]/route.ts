import { proxyToServer } from "@/lib/bff";

type Params = { params: Promise<{ id: string }> };

// 연결 끊기 — 그 토큰은 바로 무효가 된다.
export const DELETE = async (request: Request, { params }: Params) =>
  proxyToServer(request, { path: `/connections/${encodeURIComponent((await params).id)}` });
