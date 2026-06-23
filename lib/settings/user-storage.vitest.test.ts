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

describe("user credential storage facade", () => {
  it("does not write provider credentials back to legacy browser storage on settings saves", async () => {
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

  it("leaves legacy browser credentials untouched when saving settings", async () => {
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
      configured: true,
    };

    await setUserSettingsDocument(document, {
      providerCredentialWriteMode: "replace",
    });

    expect(JSON.parse(localStorage.getItem(PROVIDER_CREDENTIALS_STORAGE_KEY) ?? "{}")).toEqual({
      openai: { type: "api_key", apiKey: "sk-openai" },
      anthropic: { type: "api_key", apiKey: "sk-anthropic" },
    });
  });

  it("migrates legacy localStorage credentials and loads safe summaries after reload", async () => {
    const document = createDefaultUserSettingsDocument();
    const expiresAt = Date.now() + 1000;
    localStorage.setItem(
      PROVIDER_CREDENTIALS_STORAGE_KEY,
      JSON.stringify({
        openai: { type: "api_key", apiKey: "sk-openai" },
        xai: {
          type: "chatgpt_oauth",
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt,
          accountId: "acct",
        },
      })
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/settings")) {
        return Response.json({
          document: {
            ...document,
            settings: {
              ...document.settings,
              providers: { credentials: {} },
            },
          },
        });
      }

      if (url.endsWith("/api/credentials")) {
        return Response.json({
          credentials: {
            openai: { type: "api_key", configured: true },
            xai: {
              type: "chatgpt_oauth",
              configured: true,
              expiresAt,
              accountId: "acct",
            },
          },
        });
      }

      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await getUserSettingsDocument();

    expect(loaded?.settings.providers.credentials.openai).toMatchObject({
      type: "api_key",
      configured: true,
    });
    expect(loaded?.settings.providers.credentials.xai).toMatchObject({
      type: "chatgpt_oauth",
      configured: true,
      accountId: "acct",
    });
    expect(localStorage.getItem(PROVIDER_CREDENTIALS_STORAGE_KEY)).toBeNull();
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
