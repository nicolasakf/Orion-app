/**
 * Shared types for the model gateway. Safe to import from client components
 * (e.g. `import type { SupportedProvider }`).
 */

export type SupportedProvider = "openai" | "anthropic" | "google" | "xai";

/**
 * Credential mode for a gateway request.
 *
 * - `byok`: use the user's own API key sent from the client
 * - `chatgpt_oauth`: use a ChatGPT OAuth access token to hit the ChatGPT backend
 */
export type CredentialMode =
  | { type: "byok"; apiKey: string }
  | { type: "chatgpt_oauth"; accessToken: string; accountId?: string };
