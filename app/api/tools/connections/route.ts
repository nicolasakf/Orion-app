import { z } from "zod";

import { renderConnectionList } from "@/lib/connections/agent-view";
import { listConnectionSummaries } from "@/lib/connections/connection-store.server";

export const runtime = "nodejs";

const ConnectionsToolRequestSchema = z.object({
  action: z.enum(["list", "request"]),
});

/**
 * POST /api/tools/connections resolves the `connections` agent tool.
 *
 * Only `list` is served here. `request` is handled entirely client-side because
 * it opens the settings dialog, and never reaches the server.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body is malformed." }, { status: 400 });
  }

  const parsed = ConnectionsToolRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  if (parsed.data.action !== "list") {
    return Response.json(
      { error: "Only the 'list' action is served by this route." },
      { status: 400 },
    );
  }

  try {
    const summaries = await listConnectionSummaries();
    return Response.json({ output: renderConnectionList(summaries) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not read stored connections.";
    return Response.json({ error: message }, { status: 500 });
  }
}
