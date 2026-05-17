/**
 * /api/dev-log — Development-only endpoint for receiving browser-side log entries.
 *
 * Browser code cannot write directly to the filesystem, so it POSTs log entries
 * here. This route forwards them to the server-side DevLogger which writes to
 * logs/{chatId}.log (one file per chat session).
 *
 * This route is a no-op in production (returns 204 immediately).
 */

import { logClientEntry } from "@/lib/logging/dev-logger";
import type { ClientLogEntry } from "@/lib/logging/dev-logger-client";

export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 204 });
  }

  try {
    const entry = (await req.json()) as ClientLogEntry;
    const fileId = entry.chatId ?? `client-session-${Date.now()}`;
    logClientEntry({
      fileId,
      category: entry.category,
      payload: entry.payload,
      browserTimestamp: entry.browserTimestamp,
    });
  } catch {
    // Never surface logging errors to callers
  }

  return new Response(null, { status: 204 });
}
