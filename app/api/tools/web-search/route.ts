import {
  EXA_MCP_URL,
  parseExaMcpText,
  WebSearchRequestSchema,
  WEB_SEARCH_DEFAULT_NUM_RESULTS,
  WEB_TOOL_TIMEOUT_MS,
} from "@/lib/agent/web-tools-server";

export const runtime = "nodejs";

/** POST /api/tools/web-search searches the public web through Exa's hosted MCP server. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body is malformed.", 400);
  }

  const parsed = WebSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const query = parsed.data.query;
  const searchRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "web_search_exa",
      arguments: {
        query,
        type: "auto",
        numResults: WEB_SEARCH_DEFAULT_NUM_RESULTS,
        livecrawl: "fallback",
      },
    },
  };

  try {
    const response = await fetch(EXA_MCP_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(searchRequest),
      signal: AbortSignal.timeout(WEB_TOOL_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return jsonError(`Search failed with status ${response.status}.${text ? ` ${text}` : ""}`, 502);
    }

    const responseText = await response.text();
    const output = parseExaMcpText(responseText) ?? "No search results found. Try a different query.";
    return Response.json({ output });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Web search failed.";
    return jsonError(message, 502);
  }
}

/** Return the shared error envelope used by web tool API routes. */
function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
