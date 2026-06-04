import { describe, expect, it } from "vitest";

import {
  createEmptyTrafficState,
  mergeTrafficBuckets,
  mergeTrafficSnapshot,
  type DailyTrafficSnapshot,
} from "./merge";

describe("mergeTrafficBuckets", () => {
  it("retains the highest count and uniques per timestamp", () => {
    const merged = mergeTrafficBuckets(
      { "2026-06-01T00:00:00.000Z": { count: 3, uniques: 2 } },
      [
        { timestamp: "2026-06-01T00:00:00.000Z", count: 5, uniques: 2 },
        { timestamp: "2026-06-02T00:00:00.000Z", count: 1, uniques: 1 },
      ],
    );

    expect(merged["2026-06-01T00:00:00.000Z"]).toEqual({ count: 5, uniques: 2 });
    expect(merged["2026-06-02T00:00:00.000Z"]).toEqual({ count: 1, uniques: 1 });
  });
});

describe("mergeTrafficSnapshot", () => {
  const snapshot: DailyTrafficSnapshot = {
    collectedAt: "2026-06-04",
    owner: "nicolasakf",
    repo: "Orion-app",
    clones: {
      day: {
        count: 10,
        uniques: 4,
        buckets: [{ timestamp: "2026-06-03T00:00:00.000Z", count: 2, uniques: 1 }],
      },
      week: {
        count: 10,
        uniques: 4,
        buckets: [{ timestamp: "2026-05-26T00:00:00.000Z", count: 10, uniques: 4 }],
      },
    },
    views: {
      day: {
        count: 20,
        uniques: 8,
        buckets: [{ timestamp: "2026-06-03T00:00:00.000Z", count: 4, uniques: 2 }],
      },
      week: {
        count: 20,
        uniques: 8,
        buckets: [{ timestamp: "2026-05-26T00:00:00.000Z", count: 20, uniques: 8 }],
      },
    },
    popularPaths: [{ path: "/README.md", title: "README", count: 3, uniques: 2 }],
    popularReferrers: [{ referrer: "example.com", count: 1, uniques: 1 }],
  };

  it("accumulates first and last collection timestamps", () => {
    const state = createEmptyTrafficState("nicolasakf", "Orion-app");
    const merged = mergeTrafficSnapshot(state, snapshot);

    expect(merged.firstCollectedAt).toBe("2026-06-04");
    expect(merged.lastCollectedAt).toBe("2026-06-04");
    expect(merged.clones.day["2026-06-03T00:00:00.000Z"]).toEqual({ count: 2, uniques: 1 });
    expect(merged.popularPaths).toHaveLength(1);
    expect(merged.popularReferrers[0]?.items[0]?.referrer).toBe("example.com");
  });

  it("replaces ranked snapshots collected on the same day", () => {
    const state = mergeTrafficSnapshot(createEmptyTrafficState("nicolasakf", "Orion-app"), snapshot);
    const updated = mergeTrafficSnapshot(state, {
      ...snapshot,
      popularPaths: [{ path: "/", title: "Home", count: 9, uniques: 5 }],
    });

    expect(updated.popularPaths).toHaveLength(1);
    expect(updated.popularPaths[0]?.items[0]?.path).toBe("/");
  });
});
