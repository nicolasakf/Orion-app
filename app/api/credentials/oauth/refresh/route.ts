
import { z } from "zod";

import { resolveProviderCredentialForModel } from "@/lib/credentials/provider-credential-store.server";

const RequestSchema = z.object({
  provider: z.string().min(1).default("openai"),
  model: z.string().min(1).default("codex-mini-latest"),
});

/**
 * POST /api/credentials/oauth/refresh
 *
 * Refreshes a stored ChatGPT OAuth credential if needed.
 *
 * Returns only whether a stored credential could be resolved.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ title: "Invalid Request", message: "Request body is malformed." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ title: "Invalid Request", message: "provider and model are required." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const credential = await resolveProviderCredentialForModel(parsed.data.provider, parsed.data.model);
    return new Response(JSON.stringify({ ok: Boolean(credential) }), {
      status: credential ? 200 : 404,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token refresh failed.";
    return new Response(
      JSON.stringify({ title: "Refresh Failed", message }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
