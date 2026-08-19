/**
 * Renders the connection state the agent is allowed to see.
 *
 * Kept separate from the store so it can be unit-tested without touching the
 * filesystem, and so there is exactly one place that decides what crosses the
 * boundary into a model context.
 */

import {
  CONNECTION_KIND_LABELS,
  type ConnectionSummary,
} from "@/lib/connections/types";

/**
 * Formats stored connections for a `connections` tool result.
 *
 * Deliberately verbose about the *absence* of connections: the failure this
 * whole subsystem exists to fix was an agent that, finding no route, invented a
 * settings panel rather than saying it had nothing.
 */
export function renderConnectionList(summaries: ConnectionSummary[]): string {
  if (summaries.length === 0) {
    return [
      "No connections are configured.",
      "",
      "Orion cannot currently reach any external system on the user's behalf.",
      "Do not describe any other way to connect one, and do not name a settings",
      "screen, panel, or button that is not listed here. To proceed, either:",
      '  - call this tool again with action "request" and the tool the user needs, or',
      "  - work from a file the user exports and saves locally, or",
      "  - ask the user to run the step themselves and paste the result.",
    ].join("\n");
  }

  const lines = summaries.map((summary) => {
    const parts = [
      `- id: ${summary.id}`,
      `  tool: ${summary.toolId}`,
      `  label: ${summary.label}`,
      `  auth: ${CONNECTION_KIND_LABELS[summary.kind]}`,
    ];

    if (summary.secretKeys.length > 0) {
      parts.push(`  stored secrets (names only): ${summary.secretKeys.join(", ")}`);
    }

    const configEntries = Object.entries(summary.config);
    if (configEntries.length > 0) {
      parts.push(
        `  settings: ${configEntries.map(([key, value]) => `${key}=${value}`).join(", ")}`,
      );
    }

    if (summary.scopes?.length) {
      parts.push(`  scopes: ${summary.scopes.join(", ")}`);
    }
    if (summary.expired) {
      parts.push("  status: access token EXPIRED — it will be refreshed on next use");
    }
    parts.push(
      summary.lastVerifiedAt
        ? `  last verified: ${summary.lastVerifiedAt}`
        : "  last verified: never — verify with the smallest possible read first",
    );

    return parts.join("\n");
  });

  return [
    `${summaries.length} connection${summaries.length === 1 ? "" : "s"} configured.`,
    "",
    ...lines,
    "",
    "Read one from a notebook cell with:",
    "    from orion_ui import connections",
    '    conn = connections.get("<id>")',
    "It resolves the secret in-process and never prints it; `conn.config` holds the",
    "non-secret settings, and helpers such as `conn.google_credentials()` and",
    "`conn.sqlalchemy_url()` build a ready client.",
    "Secret values are not available through this tool by design.",
  ].join("\n");
}

/** Formats the acknowledgement returned after opening the Connections settings. */
export function renderConnectionRequest(toolId: string | undefined, reason?: string): string {
  const target = toolId?.trim() ? toolId.trim() : "a new system";
  return [
    `Orion has opened the Connections settings for ${target}.`,
    reason ? `Stated reason: ${reason}` : null,
    "",
    "The user adds the connection there. Tell them plainly that the Connections",
    "tab is now open and what they need to supply, then wait — do not guess at a",
    "different navigation path, and do not retry this tool in a loop. Once they",
    'confirm, call this tool again with action "list" to pick up the new connection.',
  ]
    .filter((line) => line !== null)
    .join("\n");
}
