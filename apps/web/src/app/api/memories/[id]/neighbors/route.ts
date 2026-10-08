import { proxyToServer } from "@/lib/bff";

type Params = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Params) => {
  const { id } = await params;
  return proxyToServer(request, { path: `/memories/${encodeURIComponent(id)}/neighbors` });
};
