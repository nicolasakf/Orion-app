# OAuth vendor registration checklist

Account work required before Orion can offer click-to-connect for a vendor. **Only a
person with an Orion account at each vendor can do this** — it is not a code change.
The engine (`lib/connections/oauth/`) reads a manifest per vendor; each row below is
one manifest entry plus one registration.

## Ground rules

- **Redirect URI:** `http://127.0.0.1:<port>/oauth/callback` (loopback, RFC 8252).
  Prefer the IP literal over `localhost` — some vendors reject the hostname form.
  Register the exact URI; several vendors do not allow wildcards on the port, in which
  case pin the port in the manifest instead of allocating one dynamically.
- **Never request more scope than the feature needs.** Scope creep is what triggers
  vendor review, and at Google it is what triggers a paid audit.
- **Public client where possible** — no client secret shipped in the desktop app.
  Where a secret is unavoidable, see *Secret-bearing vendors* at the bottom.

## Tier A — true public clients, ship first

No client secret, no vendor review. These are the launch set.

| Vendor | Register at | Client type | Scopes to request | Notes |
|---|---|---|---|---|
| **Linear** | Settings → API → OAuth applications | Public, PKCE | `read`, `write` (drop `write` if read-only at launch) | PKCE flow documented; token endpoint params differ from the standard flow. |
| **Airtable** | Developer hub → OAuth integrations | Public, PKCE | `data.records:read`, `schema.bases:read` | **Do not generate a client secret** — Airtable documents desktop apps as secretless. Cleanest of the set. |
| **Slack** | api.slack.com/apps → new app | Public, PKCE | `channels:history`, `channels:read`, `users:read` | Must **opt into PKCE** for loopback redirects to be treated as desktop redirects. Refresh does not need a secret. |
| **GitHub** | Settings → Developer settings → OAuth Apps | **Device flow** | `repo` (or `public_repo`), `read:org` | GitHub does not distinguish public from confidential clients; the device flow is the secretless path. PKCE was added Jul 2025 but the device flow is simpler here. |

Device flow is a different UX — a code the user pastes into a browser — so the engine
needs that as a second flow type alongside the loopback redirect. Only GitHub needs it
in Tier A; decide whether it is worth building for one vendor or whether GitHub waits.

## Tier B — Google, scope-sensitive

Google is the original failing case and needs the most care, because scope choice
decides whether this costs nothing or five figures a year.

| Scope | Google's classification | What it costs |
|---|---|---|
| `spreadsheets` (or `spreadsheets.readonly`) | **Sensitive** | Written justification during review. No audit. |
| `drive.file` | Not sensitive | Only files the user explicitly picks. No audit. |
| `drive.readonly` | **Restricted** | **CASA third-party audit, roughly $15k–$75k, repeated annually.** |

**Request `spreadsheets` + `drive.file` only. Never `drive.readonly`.** Combined with
the Google Picker for file selection, this covers the real use case — "read the sheet I
point you at" — with no audit. Reaching for `drive.readonly` to enumerate a user's whole
Drive is what turns this into an annual five-figure line item.

Steps:

1. Google Cloud Console → new project (`Orion Desktop`).
2. Enable the Sheets API and the Drive API.
3. OAuth consent screen → External → fill branding, support email, privacy policy and
   terms URLs. All must be live before submission.
4. Credentials → OAuth client ID → **Desktop app**.
5. Submit for verification with the sensitive-scope justification.

**Caveat:** Google issues a `client_secret` even for Desktop clients and requires it at
token exchange for refresh tokens — PKCE alone will not substitute. Google's own docs
acknowledge that installed-app secrets are not confidential, so shipping it is accepted
practice, but it does mean Google is not a true public client. Treat the value as
non-confidential and do not reuse it anywhere else.

Unverified apps show a "Google hasn't verified this app" interstitial and are capped at
100 users — fine for beta, blocking for launch. Start verification early; it is the
long pole.

## Secret-bearing vendors — deferred

These require a client secret that a distributed desktop app cannot hold safely.

| Vendor | Problem |
|---|---|
| **Notion** | Does not support PKCE. Client secret is mandatory. |
| **HubSpot** | No PKCE public-client flow. |
| **Shopify** | Confidential client. |

Three options, in preference order:

1. **Leave them on the api-key path.** Notion and HubSpot both issue long-lived
   integration tokens that work with the shipped `api_key` kind today. Worse UX, zero
   new infrastructure, available now.
2. **Minimal hosted token-exchange endpoint.** Orion holds the secret server-side and
   performs only the code-for-token swap; refresh tokens are returned to the client and
   stored locally. User data never transits it. This is the one place local-first bends,
   and it introduces an availability dependency on our own service.
3. **Bring-your-own client credentials**, retained as an escape hatch for users who want
   it. Explicitly rejected as the default: sending a non-technical user to a vendor
   developer console is worse than pasting an API key.

## Per-vendor confidence

Verified against vendor documentation while writing this: Linear (PKCE supported),
Airtable (secretless desktop documented), Slack (PKCE opt-in, secretless refresh),
GitHub (device flow, PKCE since Jul 2025), Notion (no PKCE), Google (scope tiers,
desktop secret requirement).

**Re-check before registering.** OAuth policies change, and the cost of acting on a
stale fact here is a rejected review or an unexpected audit requirement.
