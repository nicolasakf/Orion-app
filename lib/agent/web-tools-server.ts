import { JSDOM } from "jsdom";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";

export const WEB_TOOL_TIMEOUT_MS = 30_000;
export const WEB_FETCH_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const WEB_FETCH_MAX_REDIRECTS = 5;
export const WEB_SEARCH_DEFAULT_NUM_RESULTS = 8;
export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";

export const WebFetchRequestSchema = z.object({
  url: z.string().min(1),
});

export const WebSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
});

const ExaMcpResponseSchema = z.object({
  result: z
    .object({
      content: z.array(
        z.object({
          type: z.string(),
          text: z.string(),
        })
      ),
    })
    .optional(),
});

type HostnameLookup = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<Array<{ address: string; family: number }>>;

/** Validate a public-web URL and reject schemes/hosts that can target local services. */
export function parsePublicWebUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("URL must be fully formed, for example https://example.com/page.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://.");
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Localhost URLs are not allowed.");
  }

  const ipHostname = normalizeIpHostname(hostname);
  const ipVersion = isIP(ipHostname);
  if (ipVersion === 4 && isPrivateOrReservedIPv4(ipHostname)) {
    throw new Error("Private or local network URLs are not allowed.");
  }
  if (ipVersion === 6 && isPrivateOrReservedIPv6(ipHostname)) {
    throw new Error("Private or local network URLs are not allowed.");
  }

  return url;
}

/** Resolve hostname records and reject domains that point at private/local addresses. */
export async function assertPublicHostnameResolvesPublic(
  url: URL,
  resolveHostname: HostnameLookup = lookup as HostnameLookup
): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (isIP(normalizeIpHostname(hostname))) return;

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolveHostname(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve URL hostname.");
  }

  if (addresses.length === 0) {
    throw new Error("Could not resolve URL hostname.");
  }

  for (const entry of addresses) {
    if (entry.family === 4 && isPrivateOrReservedIPv4(entry.address)) {
      throw new Error("Private or local network URLs are not allowed.");
    }
    if (entry.family === 6 && isPrivateOrReservedIPv6(entry.address)) {
      throw new Error("Private or local network URLs are not allowed.");
    }
  }
}

/** URL.hostname wraps IPv6 literals in brackets; net.isIP expects the bare address. */
function normalizeIpHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "");
}

/** Return true when an IPv4 literal is local, private, link-local, or reserved. */
export function isPrivateOrReservedIPv4(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

/** Return true when an IPv6 literal is local, private, link-local, or multicast. */
export function isPrivateOrReservedIPv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateOrReservedIPv4(mapped);
  }
  return false;
}

/** Fetch a public-web URL with manual redirect validation and byte caps. */
export async function fetchPublicWebUrl(url: URL, signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let redirectCount = 0; redirectCount <= WEB_FETCH_MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostnameResolvesPublic(current);

    const response = await fetch(current, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": "Orion/0.3 web_fetch",
        Accept: "text/html, text/markdown;q=0.9, text/plain;q=0.8, */*;q=0.1",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) return response;
    current = parsePublicWebUrl(new URL(location, current).toString());
  }

  throw new Error("Too many redirects while fetching URL.");
}

/** Read response text without allowing very large bodies into memory. */
export async function readCappedResponseText(response: Response, maxBytes = WEB_FETCH_MAX_RESPONSE_BYTES): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error("Response too large.");
  }

  if (!response.body) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error("Response too large.");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

/** Convert basic HTML pages to readable markdown-like text without adding a new dependency. */
export function htmlToReadableMarkdown(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  document
    .querySelectorAll("script, style, noscript, iframe, object, embed, svg, canvas")
    .forEach((node: Element) => node.remove());

  const title = document.querySelector("title")?.textContent?.trim();
  const body = document.body ?? document.documentElement;
  const lines: string[] = [];

  function walk(node: Node): void {
    if (node.nodeType === dom.window.Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
      return;
    }

    if (node.nodeType !== dom.window.Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const text = element.textContent?.replace(/\s+/g, " ").trim();
      if (text) lines.push(`${"#".repeat(level)} ${text}`);
      return;
    }

    if (tag === "a") {
      const text = element.textContent?.replace(/\s+/g, " ").trim();
      const href = element.getAttribute("href");
      if (text && href) {
        lines.push(`[${text}](${href})`);
        return;
      }
    }

    if (tag === "li") {
      const text = element.textContent?.replace(/\s+/g, " ").trim();
      if (text) lines.push(`- ${text}`);
      return;
    }

    for (const child of Array.from(element.childNodes)) {
      walk(child);
    }

    if (["p", "div", "section", "article", "main", "br", "tr"].includes(tag)) {
      lines.push("");
    }
  }

  walk(body);

  const content = lines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return [title ? `# ${title}` : "", content].filter(Boolean).join("\n\n");
}

/** Extract the first text payload from Exa's SSE-style MCP response body. */
export function parseExaMcpText(responseText: string): string | null {
  for (const line of responseText.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice("data:".length).trim();
    if (!raw || raw === "[DONE]") continue;

    const parsed = ExaMcpResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) continue;

    const textPart = parsed.data.result?.content.find((part) => part.type === "text" && part.text.trim());
    if (textPart) return textPart.text;
  }

  return null;
}
