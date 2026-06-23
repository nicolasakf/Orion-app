import { describe, expect, it } from "vitest";

import {
  buildKernelConnectionUrl,
  getKernelConnectionSearchTerms,
  isOrionManagedConnectionLabel,
} from "./connection-url";

describe("buildKernelConnectionUrl", () => {
  it("embeds a token when the base URL has none", () => {
    expect(
      buildKernelConnectionUrl("http://127.0.0.1:8888/", "abc123"),
    ).toBe("http://127.0.0.1:8888/?token=abc123");
  });

  it("preserves an existing token query parameter", () => {
    expect(
      buildKernelConnectionUrl(
        "http://127.0.0.1:8888/?token=already-there",
        "ignored",
      ),
    ).toBe("http://127.0.0.1:8888/?token=already-there");
  });
});

describe("isOrionManagedConnectionLabel", () => {
  it("recognizes Orion-managed labels", () => {
    expect(isOrionManagedConnectionLabel("Orion-managed Jupyter")).toBe(true);
    expect(isOrionManagedConnectionLabel("Orion-managed server")).toBe(true);
    expect(isOrionManagedConnectionLabel("Localhost")).toBe(false);
  });
});

describe("getKernelConnectionSearchTerms", () => {
  it("includes the full URL and display label for search", () => {
    expect(
      getKernelConnectionSearchTerms(
        "http://127.0.0.1:50365/",
        "secret",
        "Orion-managed Jupyter",
      ),
    ).toEqual([
      "http://127.0.0.1:50365/?token=secret",
      "http://127.0.0.1:50365/",
      "Orion-managed Jupyter",
    ]);
  });
});
