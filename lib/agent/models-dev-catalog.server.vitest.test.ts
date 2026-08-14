// @vitest-environment node

import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getModelsDevCatalogCacheFilePath } from "@/lib/local/orion-paths.server";

vi.mock("server-only", () => ({}));

const modelsDevPayload = {
  openai: {
    id: "openai",
    name: "OpenAI",
    api: "https://api.openai.com/v1",
    models: {
      "gpt-test": {
        id: "gpt-test",
        name: "GPT Test",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          { type: "toggle" },
          { type: "effort", values: ["none", "low", "medium", "high"] },
          { type: "budget_tokens", min: 1024, max: 32000 },
        ],
        tool_call: true,
        cost: {
          input: 1,
          output: 2,
          cache_read: 0.5,
        },
        limit: {
          context: 128000,
          output: 4096,
        },
        modalities: {
          input: ["text", "image"],
        },
      },
    },
  },
};

let tempDirectory: string;

/** Imports the catalog module after tests reset module-level caches. */
async function importCatalogModule() {
  return import("@/lib/agent/models-dev-catalog.server");
}

/** Installs a fetch mock that returns the sample models.dev payload. */
function mockModelsDevFetch() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify(modelsDevPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-models-dev-"));
  process.env.ORION_HOME_DIR = tempDirectory;
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("models.dev catalog cache", () => {
  it("uses no-store live fetches and shares the normalized memory cache", async () => {
    const fetchMock = mockModelsDevFetch();
    const { fetchModelsDevCatalog, fetchModelsDevProviders } =
      await importCatalogModule();

    const models = await fetchModelsDevCatalog();
    const providers = await fetchModelsDevProviders();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://models.dev/api.json");
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe("no-store");
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("next");
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      model_id: "gpt-test",
      provider_id: "openai",
      source: "models_dev",
      reasoning_options: [
        { type: "toggle" },
        { type: "effort", values: ["none", "low", "medium", "high"] },
        { type: "budget_tokens", min: 1024, max: 32000 },
      ],
    });
    expect(providers).toEqual([
      {
        id: "openai",
        label: "OpenAI",
        credentialKind: "api_key",
        apiBaseUrl: "https://api.openai.com/v1",
        source: "models_dev",
      },
    ]);

    const cacheFile = JSON.parse(
      await readFile(getModelsDevCatalogCacheFilePath(), "utf8")
    ) as { models: Array<{ reasoning_options?: unknown }>; providers: unknown[] };
    expect(cacheFile.models).toHaveLength(1);
    expect(cacheFile.models[0]?.reasoning_options).toEqual([
      { type: "toggle" },
      { type: "effort", values: ["none", "low", "medium", "high"] },
      { type: "budget_tokens", min: 1024, max: 32000 },
    ]);
    expect(cacheFile.providers).toHaveLength(1);
  });

  it("loads a fresh file cache without fetching live data after restart", async () => {
    const fetchMock = mockModelsDevFetch();
    const firstModule = await importCatalogModule();
    await firstModule.fetchModelsDevCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.resetModules();
    fetchMock.mockClear();
    const secondModule = await importCatalogModule();

    await expect(secondModule.fetchModelsDevCatalog()).resolves.toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns stale file cache data when live refresh fails", async () => {
    await mkdir(path.dirname(getModelsDevCatalogCacheFilePath()), {
      recursive: true,
    });
    await writeFile(
      getModelsDevCatalogCacheFilePath(),
      `${JSON.stringify({
        version: 1,
        fetchedAt: "2020-01-01T00:00:00.000Z",
        models: [
          {
            model_id: "stale-model",
            label: "Stale Model",
            provider_id: "stale-provider",
            input_price_per_1m: null,
            output_price_per_1m: null,
            cached_price_per_1m: null,
            context_window: null,
            max_output_tokens: null,
            long_context_threshold: null,
            long_context_input_price_per_1m: null,
            long_context_output_price_per_1m: null,
            client_avail: true,
            pinned_by_default: false,
            created_at: "2026-05-17T00:00:00.000Z",
            source: "models_dev",
          },
        ],
        providers: [
          {
            id: "stale-provider",
            label: "Stale Provider",
            credentialKind: "api_key",
            source: "models_dev",
          },
        ],
      })}\n`,
      "utf8"
    );
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchModelsDevCatalog, fetchModelsDevProviders } =
      await importCatalogModule();

    await expect(fetchModelsDevCatalog()).resolves.toMatchObject([
      { model_id: "stale-model" },
    ]);
    await expect(fetchModelsDevProviders()).resolves.toMatchObject([
      { id: "stale-provider" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps every base model when one reasoning option is malformed", async () => {
    type TestModel = Omit<
      typeof modelsDevPayload.openai.models["gpt-test"],
      "reasoning_options"
    > & { reasoning_options?: unknown };
    const payload = structuredClone(modelsDevPayload) as unknown as {
      openai: Omit<typeof modelsDevPayload.openai, "models"> & {
        models: Record<string, TestModel>;
      };
    };
    payload.openai.models["gpt-bad-options"] = {
      ...payload.openai.models["gpt-test"],
      id: "gpt-bad-options",
      name: "GPT Bad Options",
      reasoning_options: [{ type: "effort", values: ["turbo"] }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify(payload),
      { status: 200 }
    )));

    const { fetchModelsDevCatalog } = await importCatalogModule();
    const models = await fetchModelsDevCatalog();

    expect(models.map((model) => model.model_id)).toEqual([
      "gpt-test",
      "gpt-bad-options",
    ]);
    expect(models[1]?.reasoning_options).toBeUndefined();
  });

  it("loads a fresh version-1 cache without enrichment when refresh fails", async () => {
    await mkdir(path.dirname(getModelsDevCatalogCacheFilePath()), { recursive: true });
    await writeFile(getModelsDevCatalogCacheFilePath(), `${JSON.stringify({
      version: 1,
      fetchedAt: new Date().toISOString(),
      models: Array.from({ length: 3 }, (_, index) => ({
        model_id: `cached-${index}`,
        label: `Cached ${index}`,
        provider_id: "openai",
        input_price_per_1m: null,
        output_price_per_1m: null,
        cached_price_per_1m: null,
        context_window: null,
        max_output_tokens: null,
        long_context_threshold: null,
        long_context_input_price_per_1m: null,
        long_context_output_price_per_1m: null,
        client_avail: true,
        pinned_by_default: index === 0,
        created_at: "2026-05-17T00:00:00.000Z",
        source: "models_dev",
      })),
      providers: [],
    })}\n`, "utf8");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { fetchModelsDevCatalog } = await importCatalogModule();
    const models = await fetchModelsDevCatalog();

    expect(models).toHaveLength(3);
    expect(models[0]).toMatchObject({ model_id: "cached-0", pinned_by_default: true });
  });
});
