export const ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE =
  "orion-cloud-google-oauth-callback";

export const ORION_CLOUD_OAUTH_ORIGIN_PARAM = "orion_origin";
export const ORION_CLOUD_OAUTH_STATE_PARAM = "orion_state";

export interface OrionCloudGoogleOAuthCallbackMessage {
  type: typeof ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE;
  state: string;
  code?: string;
  error?: string;
  errorDescription?: string;
}

export interface OrionCloudOAuthRelayPayload {
  localOrigin: string | null;
  message: OrionCloudGoogleOAuthCallbackMessage;
}

/** Creates an unguessable state token for the local cloud OAuth relay. */
export function createCloudOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Returns whether an OAuth relay target is a local Orion app origin. */
export function isAllowedLocalOAuthOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname === "::1")
    );
  } catch {
    return false;
  }
}

/** Builds the hosted callback URL that relays Google OAuth back to local Orion. */
export function buildCloudGoogleOAuthRedirectUrl(
  apiBaseUrl: string,
  localOrigin: string,
  state: string,
): string {
  const url = new URL(
    `${apiBaseUrl.replace(/\/+$/, "")}/cloud/oauth/callback`,
  );
  url.searchParams.set(ORION_CLOUD_OAUTH_ORIGIN_PARAM, localOrigin);
  url.searchParams.set(ORION_CLOUD_OAUTH_STATE_PARAM, state);
  return url.toString();
}

/** Returns the hosted origin expected to send OAuth relay messages. */
export function getCloudOAuthCallbackOrigin(apiBaseUrl: string): string {
  return new URL(apiBaseUrl).origin;
}

/** Parses and validates a message from the hosted Google OAuth relay page. */
export function parseCloudGoogleOAuthCallbackMessage(
  value: unknown,
): OrionCloudGoogleOAuthCallbackMessage | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Record<string, unknown>;
  if (candidate.type !== ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE) {
    return null;
  }
  if (typeof candidate.state !== "string" || candidate.state.length === 0) {
    return null;
  }

  const message: OrionCloudGoogleOAuthCallbackMessage = {
    type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
    state: candidate.state,
  };
  if (typeof candidate.code === "string" && candidate.code.length > 0) {
    message.code = candidate.code;
  }
  if (typeof candidate.error === "string" && candidate.error.length > 0) {
    message.error = candidate.error;
  }
  if (
    typeof candidate.errorDescription === "string" &&
    candidate.errorDescription.length > 0
  ) {
    message.errorDescription = candidate.errorDescription;
  }
  return message;
}

/** Returns whether a relay message is for the active local OAuth attempt. */
export function isExpectedCloudGoogleOAuthCallbackMessage(
  value: unknown,
  expectedState: string,
): value is OrionCloudGoogleOAuthCallbackMessage {
  const message = parseCloudGoogleOAuthCallbackMessage(value);
  return message !== null && message.state === expectedState;
}

/** Reads the hosted callback query/hash params into a relay payload. */
export function readCloudOAuthRelayPayload(
  href: string,
): OrionCloudOAuthRelayPayload {
  const url = new URL(href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

  const getParam = (name: string): string | null =>
    url.searchParams.get(name) ?? hashParams.get(name);

  const state = getParam(ORION_CLOUD_OAUTH_STATE_PARAM) ?? "";
  const message: OrionCloudGoogleOAuthCallbackMessage = {
    type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
    state,
  };

  const code = getParam("code");
  if (code) message.code = code;

  const error = getParam("error");
  if (error) message.error = error;

  const errorDescription =
    getParam("error_description") ?? getParam("errorDescription");
  if (errorDescription) message.errorDescription = errorDescription;

  return {
    localOrigin: getParam(ORION_CLOUD_OAUTH_ORIGIN_PARAM),
    message,
  };
}

export type CloudOAuthRelayPollResult =
  | { status: "pending" }
  | ({ status: "success" } & OrionCloudGoogleOAuthCallbackMessage);

/** Polls hosted Orion for a completed Google OAuth result by state. */
export async function pollCloudGoogleOAuthRelay(
  apiBaseUrl: string,
  state: string,
): Promise<CloudOAuthRelayPollResult> {
  const url = new URL("/api/cloud/oauth/relay", `${apiBaseUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("state", state);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to check Google sign-in status.");
  }

  const json = (await response.json()) as unknown;
  if (typeof json !== "object" || json === null) {
    throw new Error("Google sign-in status response was invalid.");
  }

  const candidate = json as Record<string, unknown>;
  if (candidate.status === "pending") {
    return { status: "pending" };
  }
  if (candidate.status !== "success") {
    throw new Error("Google sign-in status response was invalid.");
  }

  const message = parseCloudGoogleOAuthCallbackMessage({
    ...candidate,
    type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
  });
  if (!message) {
    throw new Error("Google sign-in status response was invalid.");
  }

  return { status: "success", ...message };
}
