import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  CLIENT_ID,
  ISSUER,
  extractAccountId,
  type TokenResponse,
} from "@/lib/credentials/chatgpt-oauth";
import {
  saveProviderCredential,
  type ProviderCredentialSummary,
} from "@/lib/credentials/provider-credential-store.server";

export const BROWSER_OAUTH_PORT = 1455;
export const BROWSER_OAUTH_CALLBACK_PATH = "/auth/callback";
export const BROWSER_OAUTH_REDIRECT_URI =
  `http://localhost:${BROWSER_OAUTH_PORT}${BROWSER_OAUTH_CALLBACK_PATH}`;

const BROWSER_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const BROWSER_OAUTH_SUCCESS_RETENTION_MS = 60 * 1000;

type BrowserOAuthPhase = "pending" | "success" | "failed";

export interface PkceCodes {
  verifier: string;
  challenge: string;
}

interface BrowserOAuthFlow {
  id: string;
  state: string;
  pkce: PkceCodes;
  status: BrowserOAuthPhase;
  expiresAt: number;
  credential?: ProviderCredentialSummary;
  error?: string;
  timeout?: ReturnType<typeof setTimeout>;
}

export type BrowserOAuthFlowStatus =
  | { status: "pending"; expiresAt: number }
  | { status: "success"; credential: ProviderCredentialSummary }
  | { status: "failed"; message: string };

let oauthServer: Server | undefined;
let activeFlow: BrowserOAuthFlow | undefined;
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

/** Starts a ChatGPT browser OAuth flow using the Codex localhost callback URI. */
export async function startBrowserOAuthFlow(): Promise<{
  flowId: string;
  authorizationUrl: string;
  expiresAt: number;
}> {
  await ensureOAuthServer();

  clearFlowTimeout(activeFlow);
  activeFlow = {
    id: crypto.randomUUID(),
    state: base64UrlEncode(randomBytes(32)),
    pkce: generatePKCE(),
    status: "pending",
    expiresAt: Date.now() + BROWSER_OAUTH_TIMEOUT_MS,
  };
  activeFlow.timeout = setTimeout(() => {
    markFlowFailed("Browser sign-in timed out. Please try again.");
    stopOAuthServer();
  }, BROWSER_OAUTH_TIMEOUT_MS);

  return {
    flowId: activeFlow.id,
    authorizationUrl: buildBrowserAuthorizeUrl(activeFlow.pkce, activeFlow.state),
    expiresAt: activeFlow.expiresAt,
  };
}

/** Returns the current browser OAuth flow status for the settings UI. */
export function getBrowserOAuthFlowStatus(flowId: string): BrowserOAuthFlowStatus | undefined {
  if (!activeFlow || activeFlow.id !== flowId) return undefined;

  if (activeFlow.status === "pending" && activeFlow.expiresAt <= Date.now()) {
    markFlowFailed("Browser sign-in timed out. Please try again.");
    stopOAuthServer();
  }

  if (activeFlow.status === "success" && activeFlow.credential) {
    return { status: "success", credential: activeFlow.credential };
  }

  if (activeFlow.status === "failed") {
    return { status: "failed", message: activeFlow.error ?? "Browser sign-in failed." };
  }

  return { status: "pending", expiresAt: activeFlow.expiresAt };
}

/** Cancels the active browser OAuth flow when the user leaves the panel. */
export function cancelBrowserOAuthFlow(flowId: string): void {
  if (!activeFlow || activeFlow.id !== flowId) return;
  markFlowFailed("Browser sign-in cancelled.");
  stopOAuthServer();
}

/** Builds the OpenAI authorize URL used by browser sign-in. */
export function buildBrowserAuthorizeUrl(pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: BROWSER_OAUTH_REDIRECT_URI,
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "orion",
  });
  return `${ISSUER}/oauth/authorize?${params.toString()}`;
}

function generatePKCE(): PkceCodes {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function ensureOAuthServer(): Promise<void> {
  if (oauthServer?.listening) return;

  clearTimeout(cleanupTimer);
  cleanupTimer = undefined;

  oauthServer = createServer((req, res) => {
    void handleOAuthRequest(req, res).catch((error) => {
      const message = error instanceof Error ? error.message : "Browser sign-in failed.";
      markFlowFailed(message);
      stopOAuthServer();
      sendHtml(res, 500, renderOAuthPage("ChatGPT sign-in failed", message));
    });
  });

  await new Promise<void>((resolve, reject) => {
    const server = oauthServer;
    if (!server) {
      reject(new Error("Could not start browser sign-in server."));
      return;
    }

    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      oauthServer = undefined;
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            "Browser sign-in needs local port 1455, but another process is using it. Close other Codex or OpenCode sign-in windows, then try again."
          )
        );
        return;
      }
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(BROWSER_OAUTH_PORT);
  });
}

async function handleOAuthRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${BROWSER_OAUTH_PORT}`);

  if (url.pathname !== BROWSER_OAUTH_CALLBACK_PATH) {
    sendHtml(res, 404, renderOAuthPage("Not found", "This sign-in page is no longer available."));
    return;
  }

  const flow = activeFlow;
  if (!flow || flow.status !== "pending") {
    sendHtml(
      res,
      400,
      renderOAuthPage("ChatGPT sign-in expired", "Return to Orion and start sign-in again.")
    );
    return;
  }

  const error = url.searchParams.get("error");
  if (error) {
    const message = url.searchParams.get("error_description") ?? error;
    markFlowFailed(message);
    stopOAuthServer();
    sendHtml(res, 200, renderOAuthPage("ChatGPT sign-in failed", message));
    return;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) {
    markFlowFailed("OpenAI did not return an authorization code.");
    stopOAuthServer();
    sendHtml(res, 400, renderOAuthPage("ChatGPT sign-in failed", "Missing authorization code."));
    return;
  }

  if (state !== flow.state) {
    markFlowFailed("OpenAI returned an invalid sign-in state.");
    stopOAuthServer();
    sendHtml(res, 400, renderOAuthPage("ChatGPT sign-in failed", "Invalid sign-in state."));
    return;
  }

  const tokens = await exchangeBrowserCodeForTokens(code, flow.pkce.verifier);
  const jwtToInspect = tokens.id_token ?? tokens.access_token;
  const accountId = extractAccountId(jwtToInspect);
  const credential = await saveProviderCredential("openai", {
    type: "chatgpt_oauth",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    ...(accountId && { accountId }),
  });

  clearFlowTimeout(flow);
  flow.status = "success";
  flow.credential = credential;
  stopOAuthServer();
  scheduleFlowCleanup();
  sendHtml(
    res,
    200,
    renderOAuthPage("ChatGPT connected", "You can close this tab and return to Orion.")
  );
}

async function exchangeBrowserCodeForTokens(
  authorizationCode: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: BROWSER_OAUTH_REDIRECT_URI,
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

function markFlowFailed(message: string): void {
  if (!activeFlow) return;
  clearFlowTimeout(activeFlow);
  activeFlow.status = "failed";
  activeFlow.error = message;
  scheduleFlowCleanup();
}

function clearFlowTimeout(flow: BrowserOAuthFlow | undefined): void {
  if (!flow?.timeout) return;
  clearTimeout(flow.timeout);
  flow.timeout = undefined;
}

function scheduleFlowCleanup(): void {
  clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(() => {
    if (activeFlow?.status !== "pending") activeFlow = undefined;
    cleanupTimer = undefined;
  }, BROWSER_OAUTH_SUCCESS_RETENTION_MS);
}

function stopOAuthServer(): void {
  if (!oauthServer) return;
  oauthServer.close(() => undefined);
  oauthServer = undefined;
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function renderOAuthPage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #f8fafc; }
    main { max-width: 420px; padding: 32px; text-align: center; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0; color: #cbd5e1; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
