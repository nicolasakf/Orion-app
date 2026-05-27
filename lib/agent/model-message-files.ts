import type { ModelMessage } from "@ai-sdk/provider-utils";

type MessageContentPart = Record<string, unknown>;

const BASE64_DATA_URL_RE = /^data:([^;,]+)?(?:;[^,]*)*;base64,(.*)$/is;

/** Extracts raw base64 payloads from browser FileReader data URLs. */
function parseBase64DataUrl(value: string): { mediaType?: string; base64: string } | null {
  const match = BASE64_DATA_URL_RE.exec(value);
  if (!match) return null;

  return {
    ...(match[1] ? { mediaType: match[1] } : {}),
    base64: match[2].replace(/\s/g, ""),
  };
}

function normalizeFilePartDataUrl(part: MessageContentPart): MessageContentPart {
  if (part.type !== "file" || typeof part.data !== "string") {
    return part;
  }

  const parsed = parseBase64DataUrl(part.data);
  if (!parsed) return part;

  return {
    ...part,
    data: parsed.base64,
    mediaType: typeof part.mediaType === "string" ? part.mediaType : parsed.mediaType,
  };
}

function normalizeImagePartDataUrl(part: MessageContentPart): MessageContentPart {
  if (part.type !== "image" || typeof part.image !== "string") {
    return part;
  }

  const parsed = parseBase64DataUrl(part.image);
  if (!parsed) return part;

  return {
    ...part,
    image: parsed.base64,
    mediaType: typeof part.mediaType === "string" ? part.mediaType : parsed.mediaType,
  };
}

/**
 * Converts inline data URLs to raw base64 model data.
 *
 * AI SDK UI messages allow browser-friendly `data:` URLs on file parts, but
 * provider adapters interpret URL-looking model payloads as downloadable URLs.
 */
export function normalizeInlineDataUrlFileParts(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) {
      return message;
    }

    let changed = false;
    const content = message.content.map((part) => {
      if (typeof part !== "object" || part === null) {
        return part;
      }

      const normalizedFile = normalizeFilePartDataUrl(part as MessageContentPart);
      const normalizedPart = normalizeImagePartDataUrl(normalizedFile);
      changed ||= normalizedPart !== part;
      return normalizedPart;
    });

    return changed ? ({ ...message, content } as ModelMessage) : message;
  });
}
