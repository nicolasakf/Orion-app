/**
 * Shared types for the model gateway. Safe to import from client components
 * (e.g. `import type { SupportedProvider }`).
 */

export type SupportedProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "ollama"
  | "lmstudio"
  | "mlx"
  | "custom";

/**
 * Credential mode for a gateway request.
 *
 * - `byok`: use the user's own API key sent from the client
 * - `chatgpt_oauth`: use a ChatGPT OAuth access token to hit the ChatGPT backend
 * - `local_endpoint`: use an OpenAI-compatible local inference endpoint
 */
export type CredentialMode =
  | { type: "byok"; apiKey: string }
  | { type: "chatgpt_oauth"; accessToken: string; accountId?: string }
  | {
      type: "local_endpoint";
      baseUrl: string;
      modelId: string;
      apiKey?: string;
    };
