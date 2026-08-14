import { describe, expect, it, vi } from "vitest";

import { foldCompactionChunks } from "./compaction-fold";

describe("foldCompactionChunks", () => {
  it("preserves order while folding measured chunks into the prior summary", async () => {
    const calls: string[][] = [];
    const result = await foldCompactionChunks({
      items: ["a", "b", "c", "d", "e"],
      initialSummary: "prior",
      fits: async (items) => items.length <= 2,
      summarize: async (items, summary) => {
        calls.push(items);
        return { summary: `${summary}|${items.join("")}`, tokensUsed: items.length };
      },
      isContextOverflow: () => false,
      splitItem: () => null,
    });

    expect(calls).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(result).toEqual({ summary: "prior|ab|cd|e", tokensUsed: 5 });
  });

  it("bisects a chunk after a real overflow and never retries it unchanged", async () => {
    const attempts: string[] = [];
    const result = await foldCompactionChunks({
      items: ["a", "b", "c", "d"],
      fits: async () => true,
      summarize: async (items, summary) => {
        attempts.push(items.join(""));
        if (items.length > 2) throw new Error("overflow");
        return { summary: `${summary ?? ""}${items.join("")}`, tokensUsed: 1 };
      },
      isContextOverflow: (error) => error instanceof Error && error.message === "overflow",
      splitItem: () => null,
    });

    expect(attempts).toEqual(["abcd", "ab", "cd"]);
    expect(result.summary).toBe("abcd");
  });

  it("splits an individually oversized item before generation", async () => {
    const summarize = vi.fn(async (items: string[], summary: string | undefined) => ({
      summary: `${summary ?? ""}${items.join("")}`,
      tokensUsed: 1,
    }));
    const result = await foldCompactionChunks({
      items: ["abcdefgh"],
      fits: async (items) => items.every((item) => item.length <= 4),
      summarize,
      isContextOverflow: () => false,
      splitItem: (item) =>
        item.length > 1
          ? [item.slice(0, Math.ceil(item.length / 2)), item.slice(Math.ceil(item.length / 2))]
          : null,
    });

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(summarize.mock.calls[0][0]).toEqual(["abcd", "efgh"]);
    expect(result.summary).toBe("abcdefgh");
  });
});
