import "server-only";

import { z } from "zod";
import { refreshAccessToken, extractAccountId } from "@/lib/credentials/chatgpt-oauth";

const RequestSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * POST /api/credentials/oauth/refresh
 *
 * Exchanges a ChatGPT refresh token for a new access token.
 * Called client-side when the stored access token has expired.
 *
 * Returns the new credential fields so the client can update its stored settings.
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
      JSON.stringify({ title: "Invalid Request", message: "refreshToken is required." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const tokens = await refreshAccessToken(parsed.data.refreshToken);

    const jwtToInspect = tokens.id_token ?? tokens.access_token;
    const accountId = extractAccountId(jwtToInspect);

    return new Response(
      JSON.stringify({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        ...(accountId && { accountId }),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token refresh failed.";
    return new Response(
      JSON.stringify({ title: "Refresh Failed", message }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
