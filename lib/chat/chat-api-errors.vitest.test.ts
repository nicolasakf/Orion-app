import { APICallError } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";

import {
  buildChatApiErrorPayload,
  CHATGPT_ACCOUNT_URL,
  parseChatApiErrorMessage,
  serializeChatApiErrorPayload,
} from "./chat-api-errors";

describe("buildChatApiErrorPayload", () => {
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
