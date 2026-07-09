import { describe, expect, it } from "vitest";

import {
  BROWSER_OAUTH_REDIRECT_URI,
  buildBrowserAuthorizeUrl,
} from "@/lib/credentials/chatgpt-browser-oauth.server";
import { CLIENT_ID, ISSUER } from "@/lib/credentials/chatgpt-oauth";

describe("ChatGPT browser OAuth", () => {
  it("builds the Codex browser authorization URL with the registered localhost callback", () => {
    const url = new URL(buildBrowserAuthorizeUrl(
      { verifier: "verifier", challenge: "challenge" },
      "state-123"
    ));

    expect(url.origin).toBe(ISSUER);
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(BROWSER_OAUTH_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe("openid profile email offline_access");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("id_token_add_organizations")).toBe("true");
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
    expect(url.searchParams.get("originator")).toBe("orion");
    expect(url.searchParams.get("state")).toBe("state-123");
  });
});
