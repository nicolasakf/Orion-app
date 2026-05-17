import "server-only";

import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const RequestSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google", "xai"]),
  apiKey: z.string().min(1),
});

/**
 * POST /api/credentials/validate
 *
 * Validates a user-provided API key by making a lightweight provider API call.
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

  const { provider, apiKey } = parsed.data;

  try {
    await validateKey(provider, apiKey);
    return new Response(JSON.stringify({ valid: true }), {
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

/** Make a lightweight API call to verify the key is valid. */
async function validateKey(provider: string, apiKey: string): Promise<void> {
  switch (provider) {
    case "openai":
    case "xai": {
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
      break;
    }

    case "anthropic": {
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
      break;
    }

    case "google": {
      void createGoogleGenerativeAI; // ensure import is used
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
      break;
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
