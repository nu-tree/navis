import { handleDeleteMemory, handlePatchMemory, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const OPTIONS = () => preflight();
export const PATCH = async (req: Request, ctx: Ctx) =>
  handlePatchMemory(req, (await ctx.params).id);
export const DELETE = async (req: Request, ctx: Ctx) =>
  handleDeleteMemory(req, (await ctx.params).id);
