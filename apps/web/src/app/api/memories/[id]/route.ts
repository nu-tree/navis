import { proxyToServer } from "@/lib/bff";

type Params = { params: Promise<{ id: string }> };

const path = async ({ params }: Params) => `/memories/${encodeURIComponent((await params).id)}`;

export const PATCH = async (request: Request, ctx: Params) =>
  proxyToServer(request, { path: await path(ctx) });

export const DELETE = async (request: Request, ctx: Params) =>
  proxyToServer(request, { path: await path(ctx) });
