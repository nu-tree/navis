import { handleDeleteConnector, handlePutConnector, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const OPTIONS = () => preflight();
export const PUT = async (req: Request, ctx: Ctx) =>
  handlePutConnector(req, (await ctx.params).id);
export const DELETE = async (req: Request, ctx: Ctx) =>
  handleDeleteConnector(req, (await ctx.params).id);
