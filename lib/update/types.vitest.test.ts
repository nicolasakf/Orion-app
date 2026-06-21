import { describe, expect, it } from "vitest";

import { compareStableVersions } from "./types";

describe("compareStableVersions", () => {
  it("compares major, minor, and patch numbers numerically", () => {
    expect(compareStableVersions("0.11.0", "0.10.9")).toBeGreaterThan(0);
    expect(compareStableVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareStableVersions("1.2.3", "2.0.0")).toBeLessThan(0);
  });

  it("rejects partial and prerelease versions", () => {
    expect(() => compareStableVersions("1.2", "1.2.0")).toThrow("Invalid stable version");
    expect(() => compareStableVersions("1.2.3-beta", "1.2.2")).toThrow("Invalid stable version");
  });
});
