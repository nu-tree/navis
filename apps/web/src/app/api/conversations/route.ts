import { proxyToServer } from "@/lib/bff";

export const GET = (request: Request) =>
  proxyToServer(request, { path: "/conversations" });
