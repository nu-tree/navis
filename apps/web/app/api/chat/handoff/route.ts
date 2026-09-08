import { handleChatHandoff, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = () => preflight();
export const POST = (req: Request) => handleChatHandoff(req);
