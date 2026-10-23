import { proxyToServer } from "@/lib/bff";

type Params = { params: Promise<{ id: string }> };

// 처리 표시 — 관리자 전용(server 가 403 으로 막는다).
export const PATCH = async (request: Request, { params }: Params) =>
  proxyToServer(request, { path: `/feedback/${encodeURIComponent((await params).id)}` });
