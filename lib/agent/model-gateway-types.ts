/**
 * Shared types for the model gateway. Safe to import from client components.
 */

export type ProviderId = string;

export type BuiltInProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "groq"
  | "cerebras"
  | "vercel"
  | "ollama"
  | "lmstudio"
  | "mlx"
  | "custom";

/** Backward-compatible alias while call sites move to runtime provider IDs. */
export type SupportedProvider = ProviderId;

/**
 * Credential mode for a gateway request.
 *
 * - `byok`: use the user's own API key sent from the client
 * - `chatgpt_oauth`: use a ChatGPT OAuth access token to hit the ChatGPT backend
 * - `local_endpoint`: use an OpenAI-compatible local inference endpoint
 */
export type CredentialMode =
  | { type: "byok"; apiKey: string; baseUrl?: string }
  | { type: "chatgpt_oauth"; accessToken: string; accountId?: string }
  | {
      type: "local_endpoint";
      baseUrl: string;
      modelId: string;
      label?: string;
      models?: Array<{ modelId: string; label?: string; enabled?: boolean }>;
      apiKey?: string;
    };
