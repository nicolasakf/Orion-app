/**
 * Downloads a brand logo for every entry in `lib/onboarding/business-tools.ts`
 * into `public/assets/tool-logos/`, and regenerates the manifest the picker
 * reads to decide between a logo and a monogram tile.
 *
 * Logos are committed rather than fetched at runtime. Orion is a local-first
 * app: the onboarding picker must render offline, and requesting a per-brand
 * asset while the user browses their own stack would leak that browsing to a
 * third-party CDN.
 *
 * Sources are tried in order, first hit wins:
 *   1. gilbarbara/logos  — full-colour marks, widest business-tool coverage
 *   2. svgl              — fills gaps gilbarbara misses (ClickUp, M365 apps)
 *   3. simple-icons      — monochrome fallback, tinted with the brand colour
 *
 * Every downloaded file is sanitized (scripts, event handlers, external
 * references and raster embeds removed) before it is written.
 *
 * Usage:
 *   node scripts/fetch-tool-logos.mjs            # only missing logos
 *   node scripts/fetch-tool-logos.mjs --force    # re-download everything
 */

import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "public", "assets", "tool-logos");
const manifestPath = path.join(root, "lib", "onboarding", "tool-logos.generated.ts");
const force = process.argv.includes("--force");

const GILBARBARA_BASE = "https://cdn.jsdelivr.net/gh/gilbarbara/logos@main/logos";
const SVGL_BASE = "https://cdn.jsdelivr.net/gh/pheralb/svgl@main/static/library";
const SIMPLE_ICONS_BASE = "https://cdn.jsdelivr.net/npm/simple-icons@16/icons";

/**
 * Source slugs that automatic derivation gets wrong.
 *
 * Keys are catalog tool ids. Each value lists candidates per source, tried in
 * order; an empty array disables that source for the tool.
 */
const SLUG_OVERRIDES = {
  slack: { gilbarbara: ["slack-icon"] },
  "microsoft-teams": { gilbarbara: ["microsoft-teams"] },
  "google-chat": { gilbarbara: [], svgl: ["google-chat"] },
  gmail: { gilbarbara: ["google-gmail"] },
  "microsoft-outlook": { gilbarbara: [], svgl: ["microsoft-outlook"] },
  zoom: { gilbarbara: ["zoom-icon"] },
  "google-meet": { gilbarbara: ["google-meet"] },
  discord: { gilbarbara: ["discord-icon"] },
  "whatsapp-business": { gilbarbara: ["whatsapp-icon"] },
  "google-calendar": { gilbarbara: ["google-calendar"] },
  calendly: { gilbarbara: [], svgl: ["calendly"] },
  loom: { gilbarbara: ["loom-icon"] },

  salesforce: { gilbarbara: ["salesforce"] },
  hubspot: { gilbarbara: ["hubspot"] },
  pipedrive: { gilbarbara: ["pipedrive"] },
  "zoho-crm": { gilbarbara: ["zoho"] },
  "microsoft-dynamics-365": { gilbarbara: [], svgl: ["microsoft-dynamics-365"] },
  close: { gilbarbara: [], svgl: [] },
  freshsales: { gilbarbara: ["freshworks"], svgl: [] },
  outreach: { gilbarbara: [] },
  salesloft: { gilbarbara: [] },
  gong: { gilbarbara: [] },

  sap: { gilbarbara: ["sap"] },
  netsuite: { gilbarbara: [], svgl: [] },
  oracle: { gilbarbara: ["oracle"] },
  "microsoft-dynamics-business-central": { gilbarbara: [], svgl: [] },
  odoo: { gilbarbara: [], simpleIcons: ["odoo"] },
  quickbooks: { gilbarbara: [], simpleIcons: ["quickbooks"] },
  xero: { gilbarbara: [], simpleIcons: ["xero"] },
  sage: { gilbarbara: [], simpleIcons: ["sage"] },
  freshbooks: { gilbarbara: ["freshbooks"] },
  "zoho-books": { gilbarbara: ["zoho"] },
  ramp: { gilbarbara: [], svgl: ["ramp"] },
  brex: { gilbarbara: [], simpleIcons: ["brex"] },
  expensify: { gilbarbara: [], simpleIcons: ["expensify"] },
  bill: { gilbarbara: [], svgl: [] },

  jira: { gilbarbara: ["jira"] },
  linear: { gilbarbara: ["linear-icon"] },
  asana: { gilbarbara: ["asana-icon"] },
  monday: { gilbarbara: ["monday-icon"], svgl: ["monday"] },
  clickup: { gilbarbara: [], svgl: ["clickup"] },
  trello: { gilbarbara: ["trello"] },
  "notion-projects": { gilbarbara: [], svgl: ["notion"] },
  smartsheet: { gilbarbara: [], svgl: [] },
  wrike: { gilbarbara: [], svgl: [] },
  basecamp: { gilbarbara: ["basecamp-icon"] },
  shortcut: { gilbarbara: [], svgl: [] },
  todoist: { gilbarbara: [], simpleIcons: ["todoist"] },
  servicenow: { gilbarbara: [], svgl: [] },

  notion: { gilbarbara: [], svgl: ["notion"] },
  confluence: { gilbarbara: ["confluence"] },
  "google-docs": { gilbarbara: ["google-docs"] },
  "microsoft-sharepoint": { gilbarbara: [], svgl: ["microsoft-sharepoint"] },
  coda: { gilbarbara: ["coda-icon"] },
  slite: { gilbarbara: [] },
  guru: { gilbarbara: [] },
  obsidian: { gilbarbara: ["obsidian-icon"], svgl: ["obsidian"] },

  "google-drive": { gilbarbara: ["google-drive"] },
  "google-sheets": { gilbarbara: [], svgl: ["google-sheets"] },
  "microsoft-onedrive": { gilbarbara: ["microsoft-onedrive"] },
  "microsoft-excel": { gilbarbara: [], svgl: ["microsoft-excel"] },
  dropbox: { gilbarbara: ["dropbox"] },
  box: { gilbarbara: ["box-icon"] },
  "amazon-s3": { gilbarbara: ["aws-s3"] },

  snowflake: { gilbarbara: ["snowflake-icon"] },
  "google-bigquery": { gilbarbara: [], simpleIcons: ["googlebigquery"] },
  databricks: { gilbarbara: ["databricks-icon"] },
  postgresql: { gilbarbara: ["postgresql"] },
  mysql: { gilbarbara: ["mysql-icon"] },
  "microsoft-sql-server": { gilbarbara: [], svgl: ["sql-server"] },
  "amazon-redshift": { gilbarbara: ["aws-redshift"] },
  looker: { gilbarbara: ["looker-icon"] },
  tableau: { gilbarbara: ["tableau-icon"], svgl: ["tableau"] },
  "microsoft-power-bi": { gilbarbara: ["microsoft-power-bi"] },
  metabase: { gilbarbara: ["metabase-icon"] },
  airtable: { gilbarbara: ["airtable"] },
  dbt: { gilbarbara: ["dbt-icon"] },

  zendesk: { gilbarbara: ["zendesk-icon"] },
  intercom: { gilbarbara: ["intercom-icon"] },
  freshdesk: { gilbarbara: ["freshworks"] },
  front: { gilbarbara: ["frontapp"], svgl: ["front"] },
  "help-scout": { gilbarbara: ["helpscout"] },
  "hubspot-service": { gilbarbara: ["hubspot"] },
  crisp: { gilbarbara: ["crisp"] },

  "google-analytics": { gilbarbara: ["google-analytics"] },
  "google-ads": { gilbarbara: ["google-ads"] },
  "meta-ads": { gilbarbara: ["meta-icon"], svgl: ["meta"] },
  "linkedin-ads": { gilbarbara: ["linkedin-icon"] },
  mailchimp: { gilbarbara: ["mailchimp"] },
  klaviyo: { gilbarbara: [], svgl: ["klaviyo"] },
  "hubspot-marketing": { gilbarbara: ["hubspot"] },
  posthog: { gilbarbara: ["posthog-icon"] },
  mixpanel: { gilbarbara: ["mixpanel-icon"] },
  amplitude: { gilbarbara: ["amplitude-icon"] },
  segment: { gilbarbara: ["segment-icon"] },
  semrush: { gilbarbara: ["semrush-icon"] },

  workday: { gilbarbara: [], svgl: [] },
  bamboohr: { gilbarbara: [], svgl: [] },
  rippling: { gilbarbara: [], svgl: [] },
  gusto: { gilbarbara: ["gusto"] },
  deel: { gilbarbara: [], svgl: [] },
  hibob: { gilbarbara: [], svgl: [] },
  personio: { gilbarbara: [], svgl: [] },
  adp: { gilbarbara: [], svgl: [] },
  greenhouse: { gilbarbara: [], simpleIcons: ["greenhouse"] },
  lever: { gilbarbara: [], svgl: [] },

  shopify: { gilbarbara: ["shopify"] },
  stripe: { gilbarbara: ["stripe"] },
  paypal: { gilbarbara: ["paypal"] },
  square: { gilbarbara: ["square"] },
  woocommerce: { gilbarbara: ["woocommerce-icon"] },
  "amazon-seller-central": { gilbarbara: ["aws"], svgl: ["amazon"] },
  bigcommerce: { gilbarbara: ["bigcommerce"] },
  chargebee: { gilbarbara: ["chargebee"] },

  github: { gilbarbara: ["github-icon"] },
  gitlab: { gilbarbara: ["gitlab"] },
  sentry: { gilbarbara: ["sentry-icon"] },
  datadog: { gilbarbara: ["datadog"] },
  figma: { gilbarbara: ["figma"] },
  vercel: { gilbarbara: ["vercel-icon"] },
  "amazon-web-services": { gilbarbara: ["aws"] },
  "microsoft-azure": { gilbarbara: ["microsoft-azure"] },
  "google-cloud": { gilbarbara: ["google-cloud"] },
};

/** Loads the catalog through the TypeScript transpiler already used by scripts. */
async function loadCatalog() {
  const require = createRequire(import.meta.url);
  require("tsx/cjs");
  const catalog = require(path.join(root, "lib", "onboarding", "business-tools.ts"));
  return catalog.BUSINESS_TOOLS;
}

/** Simple-icons derives slugs by lowercasing the title and dropping non-alnum. */
function simpleIconsSlug(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Returns the candidate slugs to try for one tool, per source. */
function candidatesFor(tool) {
  const override = SLUG_OVERRIDES[tool.id] ?? {};
  const derived = tool.id;
  return {
    gilbarbara: override.gilbarbara ?? [`${derived}-icon`, derived],
    svgl: override.svgl ?? [derived],
    simpleIcons: override.simpleIcons ?? [simpleIconsSlug(tool.name), simpleIconsSlug(tool.id)],
  };
}

/** Fetches a URL, returning the body text or null for any non-200 response. */
async function fetchText(url) {
  const response = await fetch(url, {
    headers: { accept: "image/svg+xml,text/plain,*/*" },
  });
  if (!response.ok) return null;
  const text = await response.text();
  return text.includes("<svg") ? text : null;
}

/**
 * Strips anything that could execute or phone home, and normalizes sizing.
 *
 * The picker renders these through `<img>`, which already blocks scripting, but
 * the files also land in `public/` where they are directly addressable.
 */
function sanitizeSvg(svg) {
  let output = svg
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<(?:image|use)\b[^>]*(?:https?:)[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/(?:xlink:)?href\s*=\s*"(?!#)[^"]*"/gi, 'href="#"')
    .replace(/javascript:/gi, "")
    .trim();

  if (!/viewBox\s*=/i.test(output)) {
    const width = /\bwidth\s*=\s*"(\d+(?:\.\d+)?)/i.exec(output)?.[1];
    const height = /\bheight\s*=\s*"(\d+(?:\.\d+)?)/i.exec(output)?.[1];
    if (!width || !height) return null;
    output = output.replace(/<svg\b/i, `<svg viewBox="0 0 ${width} ${height}"`);
  }
  // Let CSS drive the rendered size instead of the vendor's intrinsic box.
  output = output.replace(
    /<svg\b([^>]*)>/i,
    (_match, attributes) =>
      `<svg${attributes.replace(/\s(?:width|height)\s*=\s*"[^"]*"/gi, "")}>`,
  );
  return output.includes("<svg") ? `${output}\n` : null;
}

/** Simple-icons ships single-path monochrome marks; tint them per brand. */
function tintMonochrome(svg, brandColor) {
  return svg.replace(/<svg\b([^>]*)>/i, (match, attributes) =>
    /\bfill\s*=/i.test(attributes) ? match : `<svg${attributes} fill="${brandColor}">`,
  );
}

/** Downloads the first available logo for one tool. */
async function downloadLogo(tool) {
  const candidates = candidatesFor(tool);
  const attempts = [
    ...candidates.gilbarbara.map((slug) => ({
      source: "gilbarbara",
      url: `${GILBARBARA_BASE}/${slug}.svg`,
    })),
    ...candidates.svgl.map((slug) => ({ source: "svgl", url: `${SVGL_BASE}/${slug}.svg` })),
    ...candidates.simpleIcons.map((slug) => ({
      source: "simple-icons",
      url: `${SIMPLE_ICONS_BASE}/${slug}.svg`,
    })),
  ];

  for (const attempt of attempts) {
    const raw = await fetchText(attempt.url).catch(() => null);
    if (!raw) continue;
    const sanitized = sanitizeSvg(raw);
    if (!sanitized) continue;
    return {
      source: attempt.source,
      svg:
        attempt.source === "simple-icons"
          ? tintMonochrome(sanitized, tool.brandColor)
          : sanitized,
    };
  }
  return null;
}

/** Rewrites the generated manifest of tool ids that have a committed logo. */
async function writeManifest(ids) {
  const sorted = [...ids].sort();
  const body = `// Generated by scripts/fetch-tool-logos.mjs. Do not edit by hand.
//
// Tool ids with a committed SVG under \`public/assets/tool-logos/\`. Ids absent
// from this list render the monogram fallback in \`ToolLogo\`.

export const TOOL_LOGO_IDS: readonly string[] = [
${sorted.map((id) => `  "${id}",`).join("\n")}
];

const TOOL_LOGO_ID_SET = new Set(TOOL_LOGO_IDS);

/** Returns true when a committed logo asset exists for this tool id. */
export function hasToolLogo(id: string): boolean {
  return TOOL_LOGO_ID_SET.has(id);
}

/** Returns the public URL of a tool's committed logo asset. */
export function getToolLogoUrl(id: string): string {
  return \`/assets/tool-logos/\${id}.svg\`;
}
`;
  await writeFile(manifestPath, body, "utf8");
}

async function main() {
  const tools = await loadCatalog();
  await mkdir(outputDir, { recursive: true });

  if (force) {
    for (const entry of await readdir(outputDir)) {
      if (entry.endsWith(".svg")) await rm(path.join(outputDir, entry));
    }
  }

  const existing = new Set(
    (await readdir(outputDir)).filter((n) => n.endsWith(".svg")).map((n) => n.slice(0, -4)),
  );
  const resolved = new Set(existing);
  const missing = [];
  const bySource = {};

  for (const tool of tools) {
    if (existing.has(tool.id)) continue;
    const result = await downloadLogo(tool);
    if (!result) {
      missing.push(`${tool.id} (${tool.name})`);
      continue;
    }
    await writeFile(path.join(outputDir, `${tool.id}.svg`), result.svg, "utf8");
    resolved.add(tool.id);
    bySource[result.source] = (bySource[result.source] ?? 0) + 1;
    console.log(`  ${tool.id} <- ${result.source}`);
  }

  await writeManifest(resolved);

  let bytes = 0;
  for (const entry of await readdir(outputDir)) {
    if (entry.endsWith(".svg")) {
      bytes += Buffer.byteLength(await readFile(path.join(outputDir, entry), "utf8"));
    }
  }

  console.log(
    `\n${resolved.size}/${tools.length} logos present (${(bytes / 1024).toFixed(0)} KiB).`,
  );
  for (const [source, count] of Object.entries(bySource)) {
    console.log(`  new from ${source}: ${count}`);
  }
  if (missing.length > 0) {
    console.log(`\nNo logo found (monogram fallback): ${missing.length}`);
    for (const entry of missing) console.log(`  - ${entry}`);
  }
}

await main();
