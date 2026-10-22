import { proxyToServer } from "@/lib/bff";

// Claude 요금제 한도 — 마지막으로 받은 값(읽기 전용).
export const GET = (request: Request) => proxyToServer(request, { path: "/settings/usage" });
