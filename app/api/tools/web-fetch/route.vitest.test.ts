import { afterEach, describe, expect, it, vi } from "vitest";

import { assertPublicHostnameResolvesPublic } from "@/lib/agent/web-tools-server";

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://orion.test/api/tools/web-fetch", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<{ output?: string; error?: string }> {
  return response.json() as Promise<{ output?: string; error?: string }>;
}

describe("POST /api/tools/web-fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects malformed request bodies", async () => {
    const response = await POST(request("{"));
    const data = await json(response);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/malformed/i);
  });

  it("rejects local and private network URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ url: "http://127.0.0.1:8888/tree" }));
    const data = await json(response);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/private|local/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects private IPv6 literal URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ url: "http://[::1]:8888/tree" }));
    const data = await json(response);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/private|local/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    const resolveHostname = vi.fn(async () => [{ address: "10.0.0.4", family: 4 }]);

    await expect(
      assertPublicHostnameResolvesPublic(new URL("https://example.test"), resolveHostname)
    ).rejects.toThrow(/private|local/i);
  });

  it("returns readable content for HTML responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          "<html><head><title>Docs</title></head><body><h1>Hello</h1><p>Read <a href=\"/guide\">the guide</a>.</p><script>ignored()</script></body></html>",
          { status: 200, headers: { "content-type": "text/html" } }
        )
      )
    );

    const response = await POST(request({ url: "https://1.1.1.1/docs" }));
    const data = await json(response);

    expect(response.status).toBe(200);
    expect(data.output).toContain("URL: https://1.1.1.1/docs");
    expect(data.output).toContain("# Docs");
    expect(data.output).toContain("# Hello");
    expect(data.output).toContain("[the guide](/guide)");
    expect(data.output).not.toContain("ignored");
  });

  it("returns raw readable content for text responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("plain docs", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
      )
    );

    const response = await POST(request({ url: "https://1.1.1.1/readme.txt" }));
    const data = await json(response);

    expect(response.status).toBe(200);
    expect(data.output).toContain("plain docs");
  });

  it("handles non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));

    const response = await POST(request({ url: "https://1.1.1.1/missing" }));
    const data = await json(response);

    expect(response.status).toBe(502);
    expect(data.error).toContain("404");
  });

  it("rejects oversized responses before reading the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("too large", {
          status: 200,
          headers: { "content-length": String(5 * 1024 * 1024 + 1) },
        })
      )
    );

    const response = await POST(request({ url: "https://1.1.1.1/large" }));
    const data = await json(response);

    expect(response.status).toBe(413);
    expect(data.error).toMatch(/too large/i);
  });
});
