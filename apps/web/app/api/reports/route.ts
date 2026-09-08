import { handleGetReports, handlePostReport, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = () => preflight();
export const GET = (req: Request) => handleGetReports(req);
export const POST = (req: Request) => handlePostReport(req);
