import { afterEach, describe, expect, it, vi } from "vitest";

import { checkPackageUpdate } from "./update";

describe("CLI update checks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("validates and compares npm registry versions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: "0.11.0" }))));
    await expect(checkPackageUpdate("0.10.1", "npm")).resolves.toBe("0.11.0");
  });

  it("uses PyPI for pip and validates its response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ info: { version: "0.10.1" } }))
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkPackageUpdate("0.10.1", "pip")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pypi.org/pypi/orion-notebook/json",
      expect.any(Object)
    );
  });

  it("rejects malformed external responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ info: {} }))));
    await expect(checkPackageUpdate("0.10.1", "uv")).rejects.toThrow();
  });
});
