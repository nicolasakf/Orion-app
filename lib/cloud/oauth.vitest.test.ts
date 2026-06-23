import { describe, expect, it } from "vitest";

import {
  ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
  buildCloudGoogleOAuthRedirectUrl,
  isAllowedLocalOAuthOrigin,
  isExpectedCloudGoogleOAuthCallbackMessage,
  readCloudOAuthRelayPayload,
} from "./oauth";

describe("cloud OAuth helpers", () => {
  it("builds the hosted Google OAuth callback URL", () => {
    const url = new URL(
      buildCloudGoogleOAuthRedirectUrl(
        "https://app.orion-agent.ai",
        "http://127.0.0.1:3001",
        "state-123",
      ),
    );

    expect(url.origin).toBe("https://app.orion-agent.ai");
    expect(url.pathname).toBe("/cloud/oauth/callback");
    expect(url.searchParams.get("orion_origin")).toBe("http://127.0.0.1:3001");
    expect(url.searchParams.get("orion_state")).toBe("state-123");
  });

  it("accepts local Orion origins and rejects non-local origins", () => {
    expect(isAllowedLocalOAuthOrigin("http://localhost:3001")).toBe(true);
    expect(isAllowedLocalOAuthOrigin("http://127.0.0.1:3001")).toBe(true);
    expect(isAllowedLocalOAuthOrigin("https://app.orion-agent.ai")).toBe(false);
    expect(isAllowedLocalOAuthOrigin("not a url")).toBe(false);
  });

  it("validates callback messages by type and state", () => {
    expect(
      isExpectedCloudGoogleOAuthCallbackMessage(
        {
          type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
          state: "expected",
          code: "auth-code",
        },
        "expected",
      ),
    ).toBe(true);

    expect(
      isExpectedCloudGoogleOAuthCallbackMessage(
        {
          type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
          state: "other",
          code: "auth-code",
        },
        "expected",
      ),
    ).toBe(false);
    expect(
      isExpectedCloudGoogleOAuthCallbackMessage(
        { type: "other", state: "expected", code: "auth-code" },
        "expected",
      ),
    ).toBe(false);
  });

  it("reads relay payload fields from callback query params", () => {
    const payload = readCloudOAuthRelayPayload(
      "https://app.orion-agent.ai/cloud/oauth/callback?orion_origin=http%3A%2F%2F127.0.0.1%3A3001&orion_state=state-123&code=auth-code",
    );

    expect(payload.localOrigin).toBe("http://127.0.0.1:3001");
    expect(payload.message).toEqual({
      type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
      state: "state-123",
      code: "auth-code",
    });
  });
});
