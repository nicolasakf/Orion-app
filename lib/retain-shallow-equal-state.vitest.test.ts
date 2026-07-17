import { describe, expect, it } from "vitest";

import { retainShallowEqualState } from "@/lib/retain-shallow-equal-state";

describe("retainShallowEqualState", () => {
  it("preserves object identity when observer measurements are unchanged", () => {
    const current = { top: false, bottom: true };

    const resolved = retainShallowEqualState(current, {
      top: false,
      bottom: true,
    });

    expect(resolved).toBe(current);
  });

  it("returns the proposed state when an observer measurement changes", () => {
    const current = { top: false, bottom: true };
    const next = { top: true, bottom: false };

    expect(retainShallowEqualState(current, next)).toBe(next);
  });
});
