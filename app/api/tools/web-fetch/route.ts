import {
  fetchPublicWebUrl,
  htmlToReadableMarkdown,
  parsePublicWebUrl,
  readCappedResponseText,
  WebFetchRequestSchema,
  WEB_TOOL_TIMEOUT_MS,
} from "@/lib/agent/web-tools-server";

export const runtime = "nodejs";

/** POST /api/tools/web-fetch fetches public web pages for read-only agent context. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body is malformed.", 400);
  }

  const parsed = WebFetchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  try {
    const url = parsePublicWebUrl(parsed.data.url);
    const response = await fetchPublicWebUrl(url, AbortSignal.timeout(WEB_TOOL_TIMEOUT_MS));
    if (!response.ok) {
      return jsonError(`Request failed with status ${response.status}.`, 502);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await readCappedResponseText(response);
    const output = contentType.toLowerCase().includes("text/html")
      ? htmlToReadableMarkdown(raw)
      : raw.trim();

    return Response.json({
      output: `URL: ${response.url || url.toString()}\nContent-Type: ${contentType || "unknown"}\n\n${output}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Web fetch failed.";
    const lower = message.toLowerCase();
    const status = lower.includes("too large")
      ? 413
      : lower.includes("url") || lower.includes("hostname") || lower.includes("localhost") || lower.includes("private")
        ? 400
        : 502;
    return jsonError(message, status);
  }
}

/** Return the shared error envelope used by web tool API routes. */
function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
