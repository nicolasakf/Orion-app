/**
 * Shared web tool limits (client-safe constants only).
 * Server implementation lives in web-tools-server.ts.
 */

export const WEB_TOOL_TIMEOUT_MS = 30_000;
export const WEB_FETCH_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const WEB_FETCH_MAX_REDIRECTS = 5;
export const WEB_SEARCH_DEFAULT_NUM_RESULTS = 8;
export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
