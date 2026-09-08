import { handleDeleteConversation, handlePutConversation, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const OPTIONS = () => preflight();
export const PUT = async (req: Request, ctx: Ctx) =>
  handlePutConversation(req, (await ctx.params).id);
export const DELETE = async (req: Request, ctx: Ctx) =>
  handleDeleteConversation(req, (await ctx.params).id);
