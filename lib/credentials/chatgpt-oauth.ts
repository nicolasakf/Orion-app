import "server-only";

/**
 * ChatGPT OAuth helpers for Orion — Device Authorization Flow.
 *
 * Adapted from OpenCode's codex.ts (MIT):
 * https://github.com/sst/opencode/blob/main/packages/opencode/src/plugin/codex.ts
 *
 * We use the **device authorization flow** (not the browser redirect flow) because
 * the OAuth client ID `app_EMoamEEZ73f0CkXaXp7hrann` has `http://localhost:1455/auth/callback`
 * registered as its redirect URI — OpenAI rejects any other redirect URI. The device flow
 * requires no redirect URI, so it works correctly from a web app.
 *
 * Flow:
 * 1. POST /api/accounts/deviceauth/usercode → get user_code + device_auth_id
 * 2. User visits https://auth.openai.com/codex/device and enters the code
 * 3. Poll /api/accounts/deviceauth/token until approved → get authorization_code + code_verifier
 * 4. Exchange authorization_code for access/refresh tokens via /oauth/token
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** OAuth client ID registered by OpenAI for their Codex CLI (and compatible apps). */
export const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/** OpenAI's OAuth authorization server. */
export const ISSUER = "https://auth.openai.com";

/** ChatGPT backend endpoint for subscription-based model access. */
export const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

/** URL where the user enters their device code. */
export const DEVICE_VERIFICATION_URL = `${ISSUER}/codex/device`;

/** Redirect URI used by the device auth flow (registered on OpenAI's side). */
const DEVICE_AUTH_REDIRECT_URI = `${ISSUER}/deviceauth/callback`;

// ── Device Authorization ──────────────────────────────────────────────────────

export interface DeviceAuthResponse {
  device_auth_id: string;
  user_code: string;
  /** Polling interval in seconds. */
  interval: string;
}

/**
 * Step 1: Request a device auth user code from OpenAI.
 * Returns the user code the user needs to enter at DEVICE_VERIFICATION_URL.
 */
export async function requestDeviceCode(): Promise<DeviceAuthResponse> {
  const res = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "orion/1.0",
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to initiate device authorization (HTTP ${res.status}): ${text}`);
  }

  return res.json() as Promise<DeviceAuthResponse>;
}

export type PollResult =
  | { status: "pending" }
  | { status: "failed" }
  | { status: "success"; authorizationCode: string; codeVerifier: string };

/**
 * Step 2: Poll the device auth token endpoint.
 * Returns "pending" while the user hasn't yet approved, "success" with the
 * authorization code when approved, or "failed" on an unrecoverable error.
 *
 * Callers should retry on "pending" after the polling interval.
 * HTTP 403/404 = still pending; any other non-OK status = failed.
 */
export async function pollDeviceAuth(
  deviceAuthId: string,
  userCode: string
): Promise<PollResult> {
  const res = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "orion/1.0",
    },
    body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
  });

  if (res.ok) {
    const data = (await res.json()) as { authorization_code: string; code_verifier: string };
    return {
      status: "success",
      authorizationCode: data.authorization_code,
      codeVerifier: data.code_verifier,
    };
  }

  // 403 / 404 = authorization pending (user hasn't entered code yet)
  if (res.status === 403 || res.status === 404) {
    return { status: "pending" };
  }

  return { status: "failed" };
}

// ── Token Exchange ────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in?: number;
}

/**
 * Step 3: Exchange the device authorization code for access + refresh tokens.
 * The redirect_uri and code_verifier come from the device auth poll response.
 */
export async function exchangeDeviceCodeForTokens(
  authorizationCode: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: DEVICE_AUTH_REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

/** Refresh an access token using the stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (HTTP ${res.status}): ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

// ── Account ID Extraction ─────────────────────────────────────────────────────

/**
 * Extract the ChatGPT account ID from a JWT token's claims.
 * OpenAI places the account ID in one of several claim locations depending on
 * whether the user is in an individual or organization account.
 */
export function extractAccountId(jwtToken: string): string | undefined {
  try {
    const parts = jwtToken.split(".");
    if (parts.length < 2) return undefined;

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    ) as Record<string, unknown>;

    if (typeof payload.chatgpt_account_id === "string") {
      return payload.chatgpt_account_id;
    }

    const auth = payload["https://api.openai.com/auth"] as Record<string, unknown> | undefined;
    if (auth && typeof auth.chatgpt_account_id === "string") {
      return auth.chatgpt_account_id;
    }

    if (Array.isArray(payload.organizations) && payload.organizations.length > 0) {
      const first = payload.organizations[0] as { id?: string };
      if (typeof first.id === "string") return first.id;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
