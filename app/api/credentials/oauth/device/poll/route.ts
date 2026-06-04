
import { z } from "zod";
import {
  pollDeviceAuth,
  exchangeDeviceCodeForTokens,
  extractAccountId,
} from "@/lib/credentials/chatgpt-oauth";

const RequestSchema = z.object({
  deviceAuthId: z.string().min(1),
  userCode: z.string().min(1),
});

/**
 * POST /api/credentials/oauth/device/poll
 *
 * Step 2 of the ChatGPT device authorization flow.
 * Polls OpenAI to check if the user has entered and approved the device code.
 *
 * Returns:
 *   { status: "pending" }  — user hasn't approved yet; client should retry after interval
 *   { status: "failed" }   — unrecoverable error; client should stop polling
 *   { status: "success", credential: { type, accessToken, refreshToken, expiresAt, accountId? } }
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
      JSON.stringify({ title: "Invalid Request", message: "deviceAuthId and userCode are required." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { deviceAuthId, userCode } = parsed.data;

  try {
    const pollResult = await pollDeviceAuth(deviceAuthId, userCode);

    if (pollResult.status === "pending") {
      return new Response(
        JSON.stringify({ status: "pending" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (pollResult.status === "failed") {
      return new Response(
        JSON.stringify({ status: "failed" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // status === "success" — exchange the authorization code for tokens
    const tokens = await exchangeDeviceCodeForTokens(
      pollResult.authorizationCode,
      pollResult.codeVerifier
    );

    const jwtToInspect = tokens.id_token ?? tokens.access_token;
    const accountId = extractAccountId(jwtToInspect);

    const credential = {
      type: "chatgpt_oauth" as const,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      ...(accountId && { accountId }),
    };

    return new Response(
      JSON.stringify({ status: "success", credential }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Polling failed.";
    return new Response(
      JSON.stringify({ status: "failed", message }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}
