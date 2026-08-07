import { describe, expect, it } from "vitest";

import { InterviewChatRequestSchema } from "@/lib/onboarding/personal-context";

describe("InterviewChatRequestSchema", () => {
  it("accepts AI SDK step metadata from a prior streamed assistant response", () => {
    const result = InterviewChatRequestSchema.safeParse({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            { type: "step-start" },
            { type: "text", text: "Where does your data live?" },
          ],
        },
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "In our Finance folder." }],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("continues to reject file parts from the interview endpoint", () => {
    const result = InterviewChatRequestSchema.safeParse({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [
            {
              type: "file",
              mediaType: "text/plain",
              url: "data:text/plain;base64,c2VjcmV0",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
