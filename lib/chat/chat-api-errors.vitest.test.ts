import { APICallError } from "@ai-sdk/provider";
import { InvalidToolInputError, NoSuchToolError } from "ai";
import { describe, expect, it } from "vitest";

import {
  buildChatApiErrorPayload,
  CHATGPT_ACCOUNT_URL,
  parseChatApiErrorMessage,
  serializeChatApiErrorPayload,
} from "./chat-api-errors";

describe("buildChatApiErrorPayload", () => {
  it("normalizes the nested OpenAI Responses streaming context error", () => {
    const error = {
      type: "error",
      sequence_number: 2,
      error: {
        type: "invalid_request_error",
        code: "context_length_exceeded",
        message:
          "Your input exceeds the context window of this model. Please adjust your input and try again.",
        param: "input",
      },
    };

    expect(buildChatApiErrorPayload(error, "openai", "gpt-5")).toMatchObject({
      code: "context_budget_exceeded",
      title: "Context Budget Exceeded",
    });
  });

  it("normalizes provider context errors to a structured recovery code", () => {
    const error = new APICallError({
      message: "maximum context length exceeded",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 400,
      responseBody: '{"error":{"code":"context_length_exceeded"}}',
      data: { error: { code: "context_length_exceeded" } },
    });

    expect(buildChatApiErrorPayload(error, "openai")).toMatchObject({
      code: "context_budget_exceeded",
      title: "Context Budget Exceeded",
    });
  });

  it("adds a ChatGPT account link for usage_limit_reached errors", () => {
    const error = new APICallError({
      message: "The usage limit has been reached",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: { model: "gpt-5.5" },
      statusCode: 429,
      responseBody:
        '{"error":{"type":"usage_limit_reached","message":"The usage limit has been reached","resets_in_seconds":96}}',
      data: {
        error: {
          type: "usage_limit_reached",
          message: "The usage limit has been reached",
          resets_in_seconds: 96,
        },
      },
    });

    const payload = buildChatApiErrorPayload(error, "chatgpt-oauth");

    expect(payload.title).toBe("Usage Limit Reached");
    expect(payload.message).toContain("The usage limit has been reached");
    expect(payload.message).toContain("about 2 minutes");
    expect(payload.actionUrl).toBe(CHATGPT_ACCOUNT_URL);
    expect(payload.actionLabel).toBe("Open ChatGPT account");
  });

  it("keeps generic rate-limit messaging for non-usage-limit 429 errors", () => {
    const error = new APICallError({
      message: "Rate limit exceeded",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: '{"error":{"type":"rate_limit_exceeded","message":"Rate limit exceeded"}}',
      data: {
        error: {
          type: "rate_limit_exceeded",
          message: "Rate limit exceeded",
        },
      },
    });

    const payload = buildChatApiErrorPayload(error, "openai");

    expect(payload.title).toBe("Rate Limit Exceeded");
    expect(payload.message).toBe("The openai provider rate limit was exceeded.");
    expect(payload.actionUrl).toBeUndefined();
  });

  it.each([
    {
      name: "Anthropic HTTP",
      provider: "anthropic",
      error: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "prompt is too long: 210000 tokens > 200000 maximum",
        },
      },
    },
    {
      name: "Anthropic SSE",
      provider: "anthropic",
      error: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Prompt is too long for this model",
        },
      },
    },
    {
      name: "Google INVALID_ARGUMENT",
      provider: "google",
      error: {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message:
            "The input token count (135538) exceeds the maximum number of tokens allowed (131072).",
        },
      },
    },
    {
      name: "xAI",
      provider: "xai",
      error: { error: { code: "context_length_exceeded", message: "context limit" } },
    },
    {
      name: "Groq",
      provider: "groq",
      error: {
        error: {
          type: "invalid_request_error",
          message: "Request too large for model llama-3.3-70b-versatile",
        },
      },
    },
    {
      name: "Cerebras",
      provider: "cerebras",
      error: new Error("Maximum context length is 131072 tokens; requested 140000 tokens"),
    },
    {
      name: "Vercel nested upstream cause",
      provider: "vercel",
      model: "openai/gpt-5",
      error: {
        type: "invalid_request_error",
        cause: {
          error: {
            type: "invalid_request_error",
            code: "context_length_exceeded",
            message: "Your input exceeds the context window of this model.",
          },
        },
      },
    },
    {
      name: "custom OpenAI-compatible endpoint",
      provider: "custom",
      error: new Error("context length exceeded for this request"),
    },
  ])("normalizes $name context-limit errors", ({ provider, model, error }) => {
    expect(buildChatApiErrorPayload(error, provider, model)).toMatchObject({
      code: "context_budget_exceeded",
    });
  });

  it.each([
    {
      name: "rate limit mentioning tokens",
      provider: "openai",
      error: new Error("Too many tokens per minute; rate limit exceeded"),
    },
    {
      name: "invalid max_tokens parameter",
      provider: "openai",
      error: {
        error: {
          type: "invalid_request_error",
          code: "max_tokens_exceeded",
          message: "max_tokens must be less than or equal to 4096",
        },
      },
    },
    {
      name: "Anthropic request byte limit",
      provider: "anthropic",
      error: { type: "error", error: { type: "request_too_large", message: "Request too large" } },
    },
    {
      name: "unrelated invalid request",
      provider: "groq",
      error: { error: { type: "invalid_request_error", message: "tools must be an array" } },
    },
    {
      name: "vague context wording",
      provider: "google",
      error: new Error("Context is required for this operation"),
    },
    {
      name: "Anthropic phrase without its invalid-request envelope",
      provider: "anthropic",
      error: new Error("Prompt is too long for this model"),
    },
    {
      name: "Groq phrase without its invalid-request envelope",
      provider: "groq",
      error: new Error("Request too large for model llama-3"),
    },
  ])("does not normalize $name as a context-limit error", ({ provider, error }) => {
    expect(buildChatApiErrorPayload(error, provider).code).toBeUndefined();
  });
});

describe("parseChatApiErrorMessage", () => {
  it("round-trips serialized chat API error payloads", () => {
    const payload = {
      title: "Usage Limit Reached",
      message: "The usage limit has been reached.",
      actionUrl: CHATGPT_ACCOUNT_URL,
      actionLabel: "Open ChatGPT account",
    };

    const parsed = parseChatApiErrorMessage(serializeChatApiErrorPayload(payload));

    expect(parsed).toEqual(payload);
  });
});

describe("tool call errors", () => {
  it("names the offending argument instead of pointing at the server logs", () => {
    // Reproduces session 1786897277027: the model omitted `progressInterval`,
    // was told only that "an unexpected error occurred", and gave up on the tool.
    const error = new InvalidToolInputError({
      toolName: "execute_cell",
      toolInput: JSON.stringify({ cellIndices: [1], stream: false }),
      cause: new Error('Invalid input: expected number, received undefined at "progressInterval"'),
    });

    const payload = buildChatApiErrorPayload(error, "vercel", "moonshotai/kimi-k2.6");

    expect(payload.code).toBe("invalid_tool_input");
    expect(payload.title).toBe("Invalid Tool Input");
    expect(payload.message).toContain("execute_cell");
    expect(payload.message).toContain("progressInterval");
    expect(payload.message).toContain("the tool itself is working");
    expect(payload.message).not.toContain("check the server logs");
  });

  it("identifies an unknown tool by name", () => {
    const payload = buildChatApiErrorPayload(
      new NoSuchToolError({ toolName: "run_notebook" }),
      "vercel"
    );

    expect(payload.code).toBe("invalid_tool_input");
    expect(payload.message).toContain("run_notebook");
  });

  it("keeps an error-shaped object's message when instanceof Error fails", () => {
    // Server-runtime bundling and stream serialization both produce these, and
    // discarding the message is what made the original failure unreadable.
    const payload = buildChatApiErrorPayload(
      { message: "Kernel connection closed unexpectedly" },
      "vercel"
    );

    expect(payload.message).toBe("Kernel connection closed unexpectedly");
  });

  it("falls back to the generic message only when there is nothing to report", () => {
    const payload = buildChatApiErrorPayload({}, "vercel");

    expect(payload.message).toContain("check the server logs");
  });
});
