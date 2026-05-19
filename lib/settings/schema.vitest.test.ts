import { describe, expect, it } from "vitest";

import { ToolApprovalModeSchema } from "@/lib/settings/schema";

describe("ToolApprovalModeSchema", () => {
  it.each([
    ["always_ask", "always_ask"],
    ["Always Ask", "always_ask"],
    ["always ask", "always_ask"],
    ["auto_run", "auto_run"],
    ["Auto Run", "auto_run"],
    ["Autorun", "auto_run"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(ToolApprovalModeSchema.parse(input)).toBe(expected);
  });
});
