import { proxyToServer } from "@/lib/bff";

export const POST = (request: Request) => proxyToServer(request, { path: "/push/unsubscribe" });
