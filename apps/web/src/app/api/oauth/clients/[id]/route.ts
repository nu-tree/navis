import { proxyToServer } from "@/lib/bff";

type Params = { params: Promise<{ id: string }> };

// 동의 화면이 보여줄 앱 이름 · 돌아갈 주소.
export const GET = async (request: Request, { params }: Params) =>
  proxyToServer(request, { path: `/oauth/clients/${encodeURIComponent((await params).id)}` });
