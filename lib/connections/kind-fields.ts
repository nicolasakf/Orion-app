/**
 * Declarative field templates for the Connections settings form.
 *
 * The point of this module is that adding support for a new authentication
 * shape is *data*, not a new form component. Each kind declares which secret
 * and non-secret fields it needs; the tab renders whatever it finds here.
 *
 * Shared by the client form and server validation, so it stays free of React
 * and Node imports.
 */

import type { ConnectionKind } from "@/lib/connections/types";

export interface ConnectionField {
  /** Key used in `secrets` or `config` on the stored connection. */
  key: string;
  label: string;
  /** Shown as an info-icon tooltip, per the settings dialog conventions. */
  description: string;
  /** Secrets are masked in the form and never returned by the API. */
  secret: boolean;
  required: boolean;
  /** Renders a textarea rather than a single-line input. */
  multiline?: boolean;
  placeholder?: string;
}

/**
 * Fields per authentication shape.
 *
 * `oauth2` is intentionally sparse: its tokens are written by the OAuth engine
 * rather than typed by hand, so the form only collects the app credentials the
 * user brings from their own vendor app registration.
 */
export const CONNECTION_FIELDS: Record<ConnectionKind, readonly ConnectionField[]> = {
  api_key: [
    {
      key: "apiKey",
      label: "API key or token",
      description:
        "The secret issued by the tool's admin settings. Stored in ~/.orion/connections.json with owner-only permissions and never shown to the assistant or included in a chat transcript.",
      secret: true,
      required: true,
      placeholder: "sk_live_…",
    },
    {
      key: "baseUrl",
      label: "Base URL",
      description:
        "Only needed when the vendor is self-hosted or region-specific. Leave blank to use the vendor's default endpoint.",
      secret: false,
      required: false,
      placeholder: "https://api.example.com",
    },
  ],
  oauth2: [
    {
      key: "clientId",
      label: "Client ID",
      description:
        "From the OAuth app you registered with the vendor. Orion uses your own app rather than a shared one, so the grant stays under your organization's control.",
      secret: false,
      required: true,
    },
    {
      key: "clientSecret",
      label: "Client secret",
      description:
        "The secret half of your registered OAuth app. Stored alongside the tokens with owner-only permissions.",
      secret: true,
      required: false,
    },
  ],
  service_account: [
    {
      key: "serviceAccountJson",
      label: "Service account key (JSON)",
      description:
        "Paste the whole JSON key file from your cloud console. For Google Sheets and Drive this avoids an OAuth flow entirely — share the sheet with the service account's client_email and it can read it directly.",
      secret: true,
      required: true,
      multiline: true,
      placeholder: '{ "type": "service_account", … }',
    },
  ],
  sql: [
    {
      key: "password",
      label: "Password",
      description: "Database password for the user below.",
      secret: true,
      required: false,
    },
    {
      key: "host",
      label: "Host",
      description: "Hostname or IP of the database server.",
      secret: false,
      required: true,
      placeholder: "db.example.com",
    },
    {
      key: "port",
      label: "Port",
      description: "Leave blank to use the driver's default port.",
      secret: false,
      required: false,
      placeholder: "5432",
    },
    {
      key: "database",
      label: "Database",
      description: "Name of the database or warehouse to connect to.",
      secret: false,
      required: true,
    },
    {
      key: "user",
      label: "User",
      description: "Database user. Prefer a read-only role.",
      secret: false,
      required: true,
    },
    {
      key: "schema",
      label: "Schema",
      description: "Optional default schema, when the tool expects one.",
      secret: false,
      required: false,
    },
  ],
  none: [],
};

/** Returns the fields for a kind, split into the two stored buckets. */
export function partitionConnectionFields(kind: ConnectionKind): {
  secretFields: ConnectionField[];
  configFields: ConnectionField[];
} {
  const fields = CONNECTION_FIELDS[kind] ?? [];
  return {
    secretFields: fields.filter((field) => field.secret),
    configFields: fields.filter((field) => !field.secret),
  };
}

/**
 * Returns the names of required fields that are missing from a submission.
 *
 * Used by both the form and the API route so the rules are stated once.
 */
export function findMissingRequiredFields(
  kind: ConnectionKind,
  values: Record<string, string>,
): string[] {
  return (CONNECTION_FIELDS[kind] ?? [])
    .filter((field) => field.required && !values[field.key]?.trim())
    .map((field) => field.label);
}
