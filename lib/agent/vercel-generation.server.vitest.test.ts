// @vitest-environment node

import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  closeChatDatabase,
  getChatCostSummary,
  getChatDatabase,
  insertModelUsage,
  resolveOrCreateChatSession,
  resolveOrCreateModelRequest,
} from "@/lib/chat/chat-sqlite-storage.server";
import {
  getVercelGenerationId,
  reconcileVercelGeneration,
} from "@/lib/agent/vercel-generation.server";

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-vercel-usage-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  closeChatDatabase();
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("Vercel generation reconciliation", () => {
  it("validates Gateway generation metadata", () => {
    expect(
      getVercelGenerationId({ gateway: { generationId: "gen_123", extra: true } })
    ).toBe("gen_123");
    expect(getVercelGenerationId({ gateway: { generationId: "" } })).toBeNull();
  });

  it("replaces pending estimates with authoritative Vercel cost and native usage", async () => {
    const session = await resolveOrCreateChatSession("chat-vercel");
    const request = await resolveOrCreateModelRequest({
      id: "request-vercel",
      origin: "user",
      chatSessionId: session?.sessionId,
    });
    await insertModelUsage({
      requestId: request.requestId,
      modelId: "openai/gpt-5",
      providerId: "vercel",
      tokensIn: 900,
      tokensOut: 90,
      costUsd: 0.01,
      estimatedCostUsd: 0.01,
      costStatus: "pending",
      costSource: "vercel_generation_pending",
      gatewayGenerationId: "gen_123",
      isByok: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: "gen_123",
        total_cost: 0.0123,
        upstream_inference_cost: 0.01,
        model: "openai/gpt-5",
        is_byok: false,
        provider_name: "openai",
        tokens_prompt: 1000,
        tokens_completion: 100,
        native_tokens_reasoning: 20,
        native_tokens_cached: 250,
        native_tokens_cache_creation: 50,
      },
    }), { status: 200 })));

    await expect(reconcileVercelGeneration("gen_123", "test-key")).resolves.toBe(true);

    const db = await getChatDatabase();
    expect(db.prepare(`select cost_status, actual_cost_usd, cost_usd,
      served_provider_id, upstream_inference_cost_usd, gateway_is_byok,
      tokens_in, tokens_out, cache_read_tokens, cache_creation_tokens,
      reasoning_tokens from model_usage where gateway_generation_id = ?`)
      .get("gen_123")).toMatchObject({
        cost_status: "exact",
        actual_cost_usd: 0.0123,
        cost_usd: 0.0123,
        served_provider_id: "openai",
        upstream_inference_cost_usd: 0.01,
        gateway_is_byok: 0,
        tokens_in: 1000,
        tokens_out: 100,
        cache_read_tokens: 250,
        cache_creation_tokens: 50,
        reasoning_tokens: 20,
      });
    await expect(getChatCostSummary("chat-vercel")).resolves.toMatchObject({
      bestAvailableTotalUsd: 0.0123,
      exactTotalUsd: 0.0123,
      estimatedTotalUsd: 0,
      exactRequestCount: 1,
      pendingRequestCount: 0,
    });
  });
});
