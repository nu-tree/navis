import { proxyToServer } from "@/lib/bff";

export const GET = (request: Request) =>
  proxyToServer(request, { path: "/conversations" });

// 주제 방 만들기(2026-11-13).
export const POST = (request: Request) =>
  proxyToServer(request, { path: "/conversations" });
