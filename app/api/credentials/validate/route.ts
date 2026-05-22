import "server-only";

import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { normalizeOpenAICompatibleBaseUrl } from "@/lib/agent/model-gateway";

const RequestSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google", "xai", "ollama", "lmstudio", "mlx", "custom"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  modelId: z.string().optional(),
});

const OpenAIModelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      object: z.string().optional(),
      created: z.number().optional(),
      owned_by: z.string().optional(),
    })
  ).default([]),
});

/**
 * POST /api/credentials/validate
 *
 * Validates a user-provided API key or local endpoint by making a lightweight provider API call.
 * Returns { valid: true } on success or { valid: false, error: string } on failure.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ title: "Invalid Request", message: "Request body is malformed." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ title: "Invalid Request", message: parsed.error.issues[0]?.message ?? "Invalid request." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { provider, apiKey, baseUrl, modelId } = parsed.data;

  try {
    const result = await validateProviderCredential(provider, { apiKey, baseUrl, modelId });
    return new Response(JSON.stringify({ valid: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Key validation failed.";
    return new Response(JSON.stringify({ valid: false, error: message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

interface ValidateProviderCredentialOptions {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

/** Make a lightweight API call to verify a provider credential or endpoint. */
async function validateProviderCredential(
  provider: string,
  options: ValidateProviderCredentialOptions
): Promise<{ models?: string[] }> {
  const { apiKey, baseUrl, modelId } = options;

  switch (provider) {
    case "openai":
    case "xai": {
      if (!apiKey) {
        throw new Error("API key is required.");
      }
      const baseURL = provider === "xai" ? "https://api.x.ai/v1" : undefined;
      const openai = createOpenAI({ apiKey, ...(baseURL && { baseURL }) });
      // Use fetch directly to hit the models list endpoint — lightweight, no streaming.
      const url = baseURL ? `${baseURL}/models` : "https://api.openai.com/v1/models";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
      void openai; // used for type import side-effect only
      return {};
    }

    case "anthropic": {
      if (!apiKey) {
        throw new Error("API key is required.");
      }
      void createAnthropic; // ensure import is used
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
      return {};
    }

    case "google": {
      if (!apiKey) {
        throw new Error("API key is required.");
      }
      void createGoogleGenerativeAI; // ensure import is used
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
      return {};
    }

    case "ollama":
    case "lmstudio":
    case "mlx":
    case "custom": {
      if (!baseUrl) {
        throw new Error("Base URL is required.");
      }
      return {
        models: await validateOpenAICompatibleEndpoint(baseUrl, modelId, apiKey),
      };
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/** Validate a local OpenAI-compatible endpoint by reading its model list. */
async function validateOpenAICompatibleEndpoint(
  baseUrl: string,
  modelId: string | undefined,
  apiKey: string | undefined
): Promise<string[]> {
  const normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(baseUrl);
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
  const res = await fetch(`${normalizedBaseUrl}/models`, {
    ...(headers && { headers }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  }

  const parsed = OpenAIModelListSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error("Model list response was not OpenAI-compatible.");
  }

  const trimmedModelId = modelId?.trim();
  const availableModelIds = parsed.data.data.map((model) => model.id);
  if (!trimmedModelId) return availableModelIds;

  if (availableModelIds.length > 0 && !availableModelIds.includes(trimmedModelId)) {
    throw new Error(`Model "${trimmedModelId}" was not found at this endpoint.`);
  }

  return availableModelIds;
}
