import { apiServer, missingApiConfig } from "@/lib/api-server";

export async function POST(request: Request) {
  const missing = missingApiConfig();
  if (missing) return Response.json({ error: missing }, { status: 500 });

  const upstream = await fetch(`${apiServer.baseUrl}/chat/cancel`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiServer.token}`,
    },
    body: await request.text(),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
