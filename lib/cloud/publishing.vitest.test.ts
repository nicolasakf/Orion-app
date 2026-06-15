import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPublishedNotebookUrl,
  downloadPublishedNotebookSource,
  listPublishedNotebooks,
  publishNotebookToCloud,
  unpublishNotebookFromCloud,
  PublishNotebookResponseSchema,
  type PublishNotebookRequest,
} from "@/lib/cloud/publishing";
import { NOTEBOOK_APP_VIEW_SCHEMA_VERSION } from "@/lib/notebook/app-view";

const request: PublishNotebookRequest = {
  metadata: {
    title: "Shared notebook",
    description: "Interactive client-side view",
    sourceFilename: "shared.ipynb",
    currentView: "app",
    allowSourceDownload: true,
  },
  bundle: {
    schemaVersion: 1,
    rendererSchemaVersion: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
    metadata: {
      title: "Shared notebook",
      description: "Interactive client-side view",
      sourceFilename: "shared.ipynb",
      currentView: "app",
      allowSourceDownload: true,
    },
    notebook: { nbformat: 4, nbformat_minor: 5, cells: [], metadata: {} },
    staticHtmlSnapshot: "<!doctype html><html><body>Shared</body></html>",
  },
};

const response = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "shared-notebook",
  title: "Shared notebook",
  description: "Interactive client-side view",
  currentView: "app",
  allowSourceDownload: true,
  url: "https://api.orion.local/p/shared-notebook",
  updatedAt: "2026-06-08T10:00:00.000Z",
};

describe("Orion cloud publishing API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds share URLs from the configured API host", () => {
    expect(buildPublishedNotebookUrl("https://api.orion.local", "shared-notebook")).toBe(
      "https://api.orion.local/p/shared-notebook",
    );
    expect(buildPublishedNotebookUrl("https://api.orion.local///", "shared-notebook")).toBe(
      "https://api.orion.local/p/shared-notebook",
    );
  });

  it("posts a validated publish payload with a Supabase bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishNotebookToCloud({
        apiBaseUrl: "https://api.orion.local",
        accessToken: "token-123",
        request,
      }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.orion.local/api/notebooks/publish",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }),
    );
  });

  it("rewrites publish share URLs to the configured API host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...response,
          url: "http://localhost:3001/p/shared-notebook",
        }),
      }),
    );

    await expect(
      publishNotebookToCloud({
        apiBaseUrl: "http://localhost:3002",
        accessToken: "token-123",
        request,
      }),
    ).resolves.toEqual({
      ...response,
      url: "http://localhost:3002/p/shared-notebook",
    });
  });

  it("validates malformed publish responses before the UI consumes them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...response, url: "not-a-url" }),
      }),
    );

    await expect(
      publishNotebookToCloud({
        apiBaseUrl: "https://api.orion.local",
        accessToken: "token-123",
        request,
      }),
    ).rejects.toThrow();
  });

  it("deletes a published notebook with a Supabase bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      unpublishNotebookFromCloud({
        apiBaseUrl: "https://api.orion.local",
        accessToken: "token-123",
        publishId: response.id,
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.orion.local/api/notebooks/${response.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer token-123",
        },
      },
    );
  });

  it("validates the authenticated owner publish list response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ notebooks: [response] }),
      }),
    );

    await expect(
      listPublishedNotebooks({
        apiBaseUrl: "https://api.orion.local",
        accessToken: "token-123",
      }),
    ).resolves.toEqual([PublishNotebookResponseSchema.parse(response)]);
  });

  it("downloads source notebooks with a Supabase bearer token", async () => {
    const notebook = { nbformat: 4, nbformat_minor: 5, cells: [], metadata: {} };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(notebook), {
        status: 200,
        headers: {
          "Content-Disposition":
            "attachment; filename*=UTF-8''Shared%20Notebook.ipynb",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadPublishedNotebookSource({
        apiBaseUrl: "https://api.orion.local",
        accessToken: "token-123",
        slug: "shared-notebook",
      }),
    ).resolves.toEqual({
      filename: "Shared Notebook.ipynb",
      notebook,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.orion.local/p/shared-notebook/download/ipynb",
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      },
    );
  });

  it("surfaces source download gate errors from Orion API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "The publisher disabled source notebook downloads.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      downloadPublishedNotebookSource({
        apiBaseUrl: "https://api.orion.local",
        accessToken: "token-123",
        slug: "shared-notebook",
      }),
    ).rejects.toThrow("The publisher disabled source notebook downloads.");
  });

  it("includes status details when source download errors only include an error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      downloadPublishedNotebookSource({
        apiBaseUrl: "https://api.orion.local",
        accessToken: "token-123",
        slug: "missing-notebook",
      }),
    ).rejects.toThrow("Not Found (404 Not Found).");
  });

  it("explains HTML source download responses as API base URL issues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!DOCTYPE html><html><body>404</body></html>", {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    await expect(
      downloadPublishedNotebookSource({
        apiBaseUrl: "http://localhost:3001",
        accessToken: "token-123",
        slug: "shared-notebook",
      }),
    ).rejects.toThrow("Orion API base URL");
  });
});
