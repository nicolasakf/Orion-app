import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultUserSettingsDocument } from "@/lib/settings/defaults";
import {
  getUserSettingsDocument,
  loadUserSettingsDocumentFromApi,
  setUserSettingsDocument,
} from "@/lib/settings/user-storage";

const PROVIDER_CREDENTIALS_STORAGE_KEY = "orion_provider_credentials";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("user browser credential storage", () => {
  it("merges credentials on ordinary settings saves so unrelated writes do not erase keys", async () => {
    localStorage.setItem(
      PROVIDER_CREDENTIALS_STORAGE_KEY,
      JSON.stringify({
        openai: { type: "api_key", apiKey: "sk-openai" },
        anthropic: { type: "api_key", apiKey: "sk-anthropic" },
      })
    );

    const document = createDefaultUserSettingsDocument();
    document.settings.appearance.theme = "dark";

    await setUserSettingsDocument(document);

    expect(JSON.parse(localStorage.getItem(PROVIDER_CREDENTIALS_STORAGE_KEY) ?? "{}")).toEqual({
      openai: { type: "api_key", apiKey: "sk-openai" },
      anthropic: { type: "api_key", apiKey: "sk-anthropic" },
    });
  });

  it("replaces credentials when explicitly requested for provider removal/reset", async () => {
    localStorage.setItem(
      PROVIDER_CREDENTIALS_STORAGE_KEY,
      JSON.stringify({
        openai: { type: "api_key", apiKey: "sk-openai" },
        anthropic: { type: "api_key", apiKey: "sk-anthropic" },
      })
    );

    const document = createDefaultUserSettingsDocument();
    document.settings.providers.credentials.openai = {
      type: "api_key",
      apiKey: "sk-openai",
    };

    await setUserSettingsDocument(document, {
      providerCredentialWriteMode: "replace",
    });

    expect(JSON.parse(localStorage.getItem(PROVIDER_CREDENTIALS_STORAGE_KEY) ?? "{}")).toEqual({
      openai: { type: "api_key", apiKey: "sk-openai" },
    });
  });

  it("loads API key and ChatGPT OAuth credentials after reload", async () => {
    const document = createDefaultUserSettingsDocument();
    localStorage.setItem(
      PROVIDER_CREDENTIALS_STORAGE_KEY,
      JSON.stringify({
        openai: { type: "api_key", apiKey: "sk-openai" },
        xai: {
          type: "chatgpt_oauth",
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: Date.now() + 1000,
          accountId: "acct",
        },
      })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          document: {
            ...document,
            settings: {
              ...document.settings,
              providers: { credentials: {} },
            },
          },
        })
      )
    );

    const loaded = await getUserSettingsDocument();

    expect(loaded?.settings.providers.credentials.openai).toMatchObject({
      type: "api_key",
      apiKey: "sk-openai",
    });
    expect(loaded?.settings.providers.credentials.xai).toMatchObject({
      type: "chatgpt_oauth",
      refreshToken: "refresh",
    });
  });

  it("returns missing status separately from failed loads", async () => {
    const document = createDefaultUserSettingsDocument();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "missing",
          document,
        })
      )
    );

    await expect(loadUserSettingsDocumentFromApi()).resolves.toMatchObject({
      status: "missing",
      document,
    });
  });

  it("returns failed status without producing a default document when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { message: "Failed to load user settings." },
          { status: 500 }
        )
      )
    );

    await expect(loadUserSettingsDocumentFromApi()).resolves.toEqual({
      status: "failed",
      message: "Failed to load user settings.",
    });
  });
});
