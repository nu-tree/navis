import { handleDeleteCron, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const OPTIONS = () => preflight();
export const DELETE = async (req: Request, ctx: Ctx) =>
  handleDeleteCron(req, (await ctx.params).id);
