import { z } from "zod";

import {
  listConnectionSummaries,
  removeConnection,
  saveConnection,
} from "@/lib/connections/connection-store.server";
import { findMissingRequiredFields } from "@/lib/connections/kind-fields";
import { CONNECTION_KINDS, ConnectionIdSchema } from "@/lib/connections/types";

export const runtime = "nodejs";

const SaveConnectionRequestSchema = z.object({
  id: ConnectionIdSchema,
  toolId: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  kind: z.enum(CONNECTION_KINDS),
  secrets: z.record(z.string()).default({}),
  config: z.record(z.string()).default({}),
});

/** GET /api/connections lists connections as summaries without secret values. */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ connections: await listConnectionSummaries() });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Could not read connections.",
      500,
    );
  }
}

/** POST /api/connections creates or replaces one connection. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body is malformed.", 400);
  }

  const parsed = SaveConnectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  // Drop blank values so an untouched optional field is absent rather than "".
  const secrets = compact(parsed.data.secrets);
  const config = compact(parsed.data.config);

  const missing = findMissingRequiredFields(parsed.data.kind, { ...secrets, ...config });
  if (missing.length > 0) {
    return jsonError(`Missing required field(s): ${missing.join(", ")}.`, 400);
  }

  try {
    const summary = await saveConnection({ ...parsed.data, secrets, config });
    return Response.json({ connection: summary });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Could not save the connection.",
      500,
    );
  }
}

/** DELETE /api/connections?id=<id> removes one connection. */
export async function DELETE(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("An `id` query parameter is required.", 400);

  try {
    const removed = await removeConnection(id);
    if (!removed) return jsonError(`No connection with id "${id}".`, 404);
    return Response.json({ removed: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Could not remove the connection.",
      500,
    );
  }
}

/** Strips blank and whitespace-only entries from a submitted field map. */
function compact(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
