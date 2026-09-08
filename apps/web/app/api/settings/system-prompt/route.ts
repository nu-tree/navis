import { handleGetSystemPrompt, handlePutSystemPrompt, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = () => preflight();
export const GET = (req: Request) => handleGetSystemPrompt(req);
export const PUT = (req: Request) => handlePutSystemPrompt(req);
