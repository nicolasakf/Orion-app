import { afterEach, describe, expect, it, vi } from "vitest";

import { EXA_MCP_URL } from "@/lib/agent/web-tools-server";

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://orion.test/api/tools/web-search", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<{ output?: string; error?: string }> {
  return response.json() as Promise<{ output?: string; error?: string }>;
}

describe("POST /api/tools/web-search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects malformed request bodies", async () => {
    const response = await POST(request("{"));
    const data = await json(response);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/malformed/i);
  });

  it("sends the expected JSON-RPC request to Exa MCP", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        `data: ${JSON.stringify({
          result: { content: [{ type: "text", text: "Result text" }] },
        })}\n\n`,
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ query: "latest notebook tools 2026" }));
    const data = await json(response);

    expect(response.status).toBe(200);
    expect(data.output).toBe("Result text");
    expect(fetchMock).toHaveBeenCalledWith(
      EXA_MCP_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        }),
      })
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init?.body)) as {
      params: { name: string; arguments: { query: string; numResults: number; livecrawl: string; type: string } };
    };
    expect(body.params.name).toBe("web_search_exa");
    expect(body.params.arguments).toMatchObject({
      query: "latest notebook tools 2026",
      type: "auto",
      numResults: 8,
      livecrawl: "fallback",
    });
  });

  it("returns a clear no-results message for empty SSE payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("\n", { status: 200 })));

    const response = await POST(request({ query: "nothing" }));
    const data = await json(response);

    expect(response.status).toBe(200);
    expect(data.output).toMatch(/no search results/i);
  });

  it("handles invalid SSE JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("data: not-json\n\n", { status: 200 })));

    const response = await POST(request({ query: "broken" }));
    const data = await json(response);

    expect(response.status).toBe(502);
    expect(data.error).toBeTruthy();
  });

  it("handles non-2xx Exa responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));

    const response = await POST(request({ query: "busy" }));
    const data = await json(response);

    expect(response.status).toBe(502);
    expect(data.error).toContain("429");
    expect(data.error).toContain("rate limited");
  });
});
