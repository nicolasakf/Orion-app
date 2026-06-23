import { afterEach, describe, expect, it, vi } from "vitest";

import { chatStorage } from "./chat-storage";

describe("chat storage read retries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recovers from a transient server error while listing chats", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Failed to list chats." }), { status: 500 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ chats: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatStorage.getChats()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
