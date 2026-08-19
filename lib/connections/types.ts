/**
 * Shared types for Orion connections — the user's own third-party business
 * systems (Google Sheets, Slack, a Postgres warehouse), as opposed to the model
 * providers described in `lib/credentials`.
 *
 * This module is imported by both the settings UI and server-only stores, so it
 * stays free of React and Node imports.
 */

import { z } from "zod";

/**
 * How a connection authenticates.
 *
 * Mirrors `BusinessToolAuthKind` in `lib/onboarding/business-tools.ts` but is
 * deliberately a separate list: that one describes what a *vendor* expects,
 * this one describes what Orion has actually *stored*. A tool catalogued as
 * `oauth` may still be connected with a service account.
 */
export const CONNECTION_KINDS = [
  "api_key",
  "oauth2",
  "service_account",
  "sql",
  "none",
] as const;

export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

/** Human-readable label for each authentication shape. */
export const CONNECTION_KIND_LABELS: Record<ConnectionKind, string> = {
  api_key: "API key or token",
  oauth2: "OAuth sign-in",
  service_account: "Service account key",
  sql: "Database credentials",
  none: "No credentials needed",
};

/** Maximum stored connections, to bound file size and settings-tab rendering. */
export const MAX_CONNECTIONS = 100;

/** Connection ids are kebab-case so they are safe in env vars and file paths. */
export const ConnectionIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Connection id must be lowercase alphanumeric with single hyphens",
  );

/**
 * A stored connection, including secret material.
 *
 * Never send this to the browser or into a chat transcript — use
 * `ConnectionSummary` instead.
 */
export const StoredConnectionSchema = z.object({
  /** Stable id the agent and notebooks refer to, e.g. `google-sheets`. */
  id: ConnectionIdSchema,
  /** Joins `lib/onboarding/business-tools.ts`; free-form when off-catalog. */
  toolId: z.string().min(1).max(100),
  /** User-facing name, e.g. "Acme finance sheet". */
  label: z.string().min(1).max(120),
  kind: z.enum(CONNECTION_KINDS),
  /**
   * Secret material, keyed by a vendor-meaningful name (`apiKey`,
   * `accessToken`, `refreshToken`, `serviceAccountJson`, `password`).
   */
  secrets: z.record(z.string()).default({}),
  /**
   * Non-secret specifics the vendor needs: subdomain, tenant, region,
   * warehouse, base id, property id, spreadsheet id, host, port, database.
   *
   * Kept distinct from `secrets` because these are safe to show the agent, and
   * most connection attempts fail for want of one of these rather than a token.
   */
  config: z.record(z.string()).default({}),
  /** Granted OAuth scopes, when the kind is `oauth2`. */
  scopes: z.array(z.string()).optional(),
  /** Epoch ms when an OAuth access token expires. */
  expiresAt: z.number().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Set by a successful verification read, so the UI can show staleness. */
  lastVerifiedAt: z.string().datetime().optional(),
});

export type StoredConnection = z.infer<typeof StoredConnectionSchema>;

export const CONNECTIONS_DOCUMENT_VERSION = 1;

export const ConnectionDocumentSchema = z.object({
  version: z.literal(CONNECTIONS_DOCUMENT_VERSION),
  connections: z.record(StoredConnectionSchema).default({}),
});

export type ConnectionDocument = z.infer<typeof ConnectionDocumentSchema>;

/**
 * The browser- and agent-safe view of a connection.
 *
 * Carries the *names* of the stored secrets so the agent can reason about what
 * is available and report what is missing, but never their values.
 */
export interface ConnectionSummary {
  id: string;
  toolId: string;
  label: string;
  kind: ConnectionKind;
  /** Keys present in `secrets`, without values. */
  secretKeys: string[];
  /** Non-secret specifics, safe to show in full. */
  config: Record<string, string>;
  scopes?: string[];
  /** True when an OAuth access token has passed its expiry. */
  expired?: boolean;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
}

/** Returns a summary that never includes secret values. */
export function summarizeConnection(connection: StoredConnection): ConnectionSummary {
  return {
    id: connection.id,
    toolId: connection.toolId,
    label: connection.label,
    kind: connection.kind,
    secretKeys: Object.keys(connection.secrets).sort(),
    config: { ...connection.config },
    ...(connection.scopes && { scopes: connection.scopes }),
    ...(connection.expiresAt !== undefined && {
      expired: connection.expiresAt <= Date.now(),
    }),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    ...(connection.lastVerifiedAt && { lastVerifiedAt: connection.lastVerifiedAt }),
  };
}
