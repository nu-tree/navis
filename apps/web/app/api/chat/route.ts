import { handleChat, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = () => preflight();
export const POST = (req: Request) => handleChat(req);
