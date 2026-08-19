import { z } from "zod";

/**
 * Catalog of the systems a typical company runs on, used by the Business
 * onboarding stack picker and by the `ORION.md` memory it produces.
 *
 * This module is shared by the client picker and the server draft generator, so
 * it stays free of React and Node imports. Per-tool notes describe only the
 * authentication *shape* and the vendor's own documentation entry point; the
 * ranked procedure for actually connecting lives once in
 * `BUSINESS_TOOL_CONNECTION_PLAYBOOK` rather than being repeated per tool.
 */

/** Stable identifiers for the question steps in the stack picker. */
export const BUSINESS_TOOL_CATEGORY_IDS = [
  "communication",
  "crm",
  "erp-finance",
  "project-tracking",
  "docs-knowledge",
  "files-storage",
  "data-bi",
  "support",
  "marketing-analytics",
  "hr-people",
  "commerce-payments",
  "engineering",
] as const;

/** Tool ids removed from the picker; ignore if still present in saved selections. */
export const DEPRECATED_BUSINESS_TOOL_IDS = ["sharefile-local"] as const;

export type BusinessToolCategoryId = (typeof BUSINESS_TOOL_CATEGORY_IDS)[number];

/** How a tool expects a caller to authenticate, at the level Orion can act on. */
export type BusinessToolAuthKind =
  | "oauth" // Interactive user consent, usually a vendor app registration.
  | "api-key" // Static key or token issued from the tool's admin settings.
  | "sql" // Database or warehouse credentials plus a host and role.
  | "file-export" // No usable API on the user's plan; work from exports.
  | "local-file"; // Already-local documents and spreadsheets.

/** One selectable tool in the onboarding picker. */
export interface BusinessTool {
  /** Stable kebab-case id persisted in the transcript and written to memory. */
  readonly id: string;
  /** Vendor product name shown in the picker and in `ORION.md`. */
  readonly name: string;
  /** Question step this tool belongs to. */
  readonly category: BusinessToolCategoryId;
  /** Extra search terms: abbreviations, former names, common misspellings. */
  readonly aliases?: readonly string[];
  /** Brand hex used for the monogram tile when no logo asset is available. */
  readonly brandColor: string;
  /** Vendor domain, so the agent resolves the right product on first session. */
  readonly site: string;
  /** Authentication shape the agent should expect. */
  readonly auth: BusinessToolAuthKind;
  /** Entry point the agent should read before attempting a connection. */
  readonly docs?: string;
  /** One short, non-secret hint that is specific to this tool. */
  readonly note?: string;
}

/** One question step: the fixed prompt every Business user is asked. */
export interface BusinessToolCategory {
  readonly id: BusinessToolCategoryId;
  /** Short label for the step rail. */
  readonly label: string;
  /** The question itself, asked verbatim of every user. */
  readonly question: string;
  /** Clarifies what counts, so users are not left guessing. */
  readonly hint: string;
  /** Wording for the "nothing here applies" answer on this step. */
  readonly noneLabel: string;
}

export const BUSINESS_TOOL_CATEGORIES: readonly BusinessToolCategory[] = [
  {
    id: "communication",
    label: "Communication",
    question: "What does your team use to talk to each other?",
    hint: "Chat, meetings, and email — wherever day-to-day decisions actually get made.",
    noneLabel: "We mostly use email and calls",
  },
  {
    id: "crm",
    label: "CRM & sales",
    question: "Do you use a CRM to track customers, deals, or pipeline?",
    hint: "Include sales engagement and call-recording tools if your team relies on them.",
    noneLabel: "No CRM yet",
  },
  {
    id: "erp-finance",
    label: "ERP & finance",
    question: "Do you use an ERP or accounting system?",
    hint: "Where invoices, purchase orders, inventory, payroll costs, or the general ledger live.",
    noneLabel: "No ERP or accounting system",
  },
  {
    id: "project-tracking",
    label: "Projects & tickets",
    question: "Where does your team track projects, tasks, and tickets?",
    hint: "Issue trackers, boards, and work management tools.",
    noneLabel: "We don't use a tracker",
  },
  {
    id: "docs-knowledge",
    label: "Docs & knowledge",
    question: "Where do your documents and internal knowledge live?",
    hint: "Wikis, doc tools, and the places people look things up.",
    noneLabel: "No shared knowledge base",
  },
  {
    id: "files-storage",
    label: "Files & spreadsheets",
    question: "Where are your files and spreadsheets stored?",
    hint: "Cloud drives, synced folders, and object storage.",
    noneLabel: "No cloud file storage",
  },
  {
    id: "data-bi",
    label: "Data & reporting",
    question: "Where does the data behind your reporting live?",
    hint: "Databases, warehouses, and BI or dashboard tools.",
    noneLabel: "No warehouse or BI tool",
  },
  {
    id: "support",
    label: "Customer support",
    question: "How do customers reach your support team?",
    hint: "Helpdesks, shared inboxes, and in-product messaging.",
    noneLabel: "No dedicated support tool",
  },
  {
    id: "marketing-analytics",
    label: "Marketing & analytics",
    question: "What do you use for marketing, ads, and web analytics?",
    hint: "Email marketing, ad platforms, and product or site analytics.",
    noneLabel: "No marketing tooling",
  },
  {
    id: "hr-people",
    label: "HR & people",
    question: "What do you use for HR, payroll, or hiring?",
    hint: "HRIS, payroll, and applicant tracking systems.",
    noneLabel: "No HR system",
  },
  {
    id: "commerce-payments",
    label: "Commerce & payments",
    question: "Do you sell online or take payments through a platform?",
    hint: "Storefronts, payment processors, and billing tools.",
    noneLabel: "We don't sell online",
  },
  {
    id: "engineering",
    label: "Engineering",
    question: "Are there developer or infrastructure tools Orion should know about?",
    hint: "Optional. Useful if you want Orion to reason about your product or its telemetry.",
    noneLabel: "Not relevant to my work",
  },
];

/**
 * The tools themselves.
 *
 * Ordering inside a category is rough popularity order, because the picker
 * shows this order before the user types anything.
 */
export const BUSINESS_TOOLS: readonly BusinessTool[] = [
  // ---------------------------------------------------------------- communication
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    brandColor: "#611F69",
    site: "slack.com",
    auth: "oauth",
    docs: "https://api.slack.com/web",
    note: "Needs a Slack app with granular bot scopes; history reads come from conversations.history.",
  },
  {
    id: "microsoft-teams",
    name: "Microsoft Teams",
    category: "communication",
    aliases: ["ms teams", "o365", "office 365"],
    brandColor: "#5059C9",
    site: "teams.microsoft.com",
    auth: "oauth",
    docs: "https://learn.microsoft.com/graph/api/resources/teams-api-overview",
    note: "Reached through Microsoft Graph; an Entra ID app registration and tenant admin consent are usually required.",
  },
  {
    id: "google-chat",
    name: "Google Chat",
    category: "communication",
    aliases: ["hangouts", "gchat"],
    brandColor: "#00AC47",
    site: "chat.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/chat/api/guides/overview",
    note: "Part of Google Workspace; a Cloud project with the Chat API enabled is required.",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "communication",
    aliases: ["google mail", "google workspace mail"],
    brandColor: "#EA4335",
    site: "mail.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/gmail/api/guides",
    note: "Read-only scopes are enough for summarizing; ask before anything that sends.",
  },
  {
    id: "microsoft-outlook",
    name: "Outlook",
    category: "communication",
    aliases: ["exchange", "office 365 mail", "microsoft 365"],
    brandColor: "#0078D4",
    site: "outlook.office.com",
    auth: "oauth",
    docs: "https://learn.microsoft.com/graph/api/resources/mail-api-overview",
    note: "Microsoft Graph mail endpoints; same app registration as Teams if both are used.",
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "communication",
    brandColor: "#0B5CFF",
    site: "zoom.us",
    auth: "oauth",
    docs: "https://developers.zoom.us/docs/api/",
    note: "Meeting recordings and transcripts need the cloud-recording scopes.",
  },
  {
    id: "google-meet",
    name: "Google Meet",
    category: "communication",
    brandColor: "#00832D",
    site: "meet.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/meet/api/guides/overview",
  },
  {
    id: "discord",
    name: "Discord",
    category: "communication",
    brandColor: "#5865F2",
    site: "discord.com",
    auth: "api-key",
    docs: "https://discord.com/developers/docs/reference",
    note: "Bot token from a Discord application, invited to the specific server.",
  },
  {
    id: "whatsapp-business",
    name: "WhatsApp Business",
    category: "communication",
    aliases: ["whatsapp"],
    brandColor: "#25D366",
    site: "business.whatsapp.com",
    auth: "api-key",
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "communication",
    brandColor: "#4285F4",
    site: "calendar.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/calendar/api/guides/overview",
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "communication",
    brandColor: "#006BFF",
    site: "calendly.com",
    auth: "api-key",
    docs: "https://developer.calendly.com/",
  },
  {
    id: "loom",
    name: "Loom",
    category: "communication",
    brandColor: "#625DF5",
    site: "loom.com",
    auth: "api-key",
    docs: "https://dev.loom.com/",
  },

  // ------------------------------------------------------------------------- crm
  {
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    aliases: ["sfdc", "sales cloud"],
    brandColor: "#00A1E0",
    site: "salesforce.com",
    auth: "oauth",
    docs: "https://developer.salesforce.com/docs/apis",
    note: "A connected app plus the instance URL; SOQL over the REST API is the practical read path.",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    brandColor: "#FF7A59",
    site: "hubspot.com",
    auth: "oauth",
    docs: "https://developers.hubspot.com/docs/api/overview",
    note: "Private app access tokens are the simplest route; scope per CRM object.",
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    category: "crm",
    brandColor: "#017737",
    site: "pipedrive.com",
    auth: "api-key",
    docs: "https://developers.pipedrive.com/docs/api/v1",
  },
  {
    id: "zoho-crm",
    name: "Zoho CRM",
    category: "crm",
    aliases: ["zoho"],
    brandColor: "#E42527",
    site: "zoho.com/crm",
    auth: "oauth",
    docs: "https://www.zoho.com/crm/developer/docs/api/v7/",
    note: "Tokens are region-scoped; confirm the data center (.com, .eu, .in) before connecting.",
  },
  {
    id: "microsoft-dynamics-365",
    name: "Dynamics 365",
    category: "crm",
    aliases: ["dynamics", "d365"],
    brandColor: "#002050",
    site: "dynamics.microsoft.com",
    auth: "oauth",
    docs: "https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview",
  },
  {
    id: "attio",
    name: "Attio",
    category: "crm",
    brandColor: "#1B1B1B",
    site: "attio.com",
    auth: "api-key",
    docs: "https://developers.attio.com/",
  },
  {
    id: "close",
    name: "Close",
    category: "crm",
    aliases: ["close.io", "close crm"],
    brandColor: "#3E5AFB",
    site: "close.com",
    auth: "api-key",
    docs: "https://developer.close.com/",
  },
  {
    id: "copper",
    name: "Copper",
    category: "crm",
    aliases: ["prosperworks"],
    brandColor: "#FF3465",
    site: "copper.com",
    auth: "api-key",
    docs: "https://developer.copper.com/",
  },
  {
    id: "freshsales",
    name: "Freshsales",
    category: "crm",
    aliases: ["freshworks crm"],
    brandColor: "#25C16F",
    site: "freshworks.com/crm",
    auth: "api-key",
    docs: "https://developers.freshworks.com/crm/api/",
  },
  {
    id: "outreach",
    name: "Outreach",
    category: "crm",
    brandColor: "#5951FF",
    site: "outreach.io",
    auth: "oauth",
    docs: "https://developers.outreach.io/api/",
  },
  {
    id: "salesloft",
    name: "Salesloft",
    category: "crm",
    brandColor: "#00A2E1",
    site: "salesloft.com",
    auth: "oauth",
    docs: "https://developers.salesloft.com/docs/api",
  },
  {
    id: "gong",
    name: "Gong",
    category: "crm",
    brandColor: "#8039DF",
    site: "gong.io",
    auth: "api-key",
    docs: "https://gong.app.gong.io/settings/api/documentation",
    note: "Call transcripts require the API access key pair issued by a Gong admin.",
  },

  // ------------------------------------------------------------------ erp-finance
  {
    id: "sap",
    name: "SAP",
    category: "erp-finance",
    aliases: ["s/4hana", "sap erp", "hana"],
    brandColor: "#0FAAFF",
    site: "sap.com",
    auth: "oauth",
    docs: "https://api.sap.com/",
    note: "Access varies by deployment; ask which SAP product and whether OData services are exposed.",
  },
  {
    id: "netsuite",
    name: "NetSuite",
    category: "erp-finance",
    aliases: ["oracle netsuite", "suiteanalytics"],
    brandColor: "#0B5DA6",
    site: "netsuite.com",
    auth: "oauth",
    docs: "https://docs.oracle.com/en/cloud/saas/netsuite/index.html",
    note: "Token-based authentication with an account id; SuiteQL is the usable query surface.",
  },
  {
    id: "oracle",
    name: "Oracle",
    category: "erp-finance",
    aliases: ["oracle fusion", "oracle erp cloud", "ebs"],
    brandColor: "#C74634",
    site: "oracle.com",
    auth: "oauth",
    docs: "https://docs.oracle.com/en/cloud/saas/index.html",
  },
  {
    id: "microsoft-dynamics-business-central",
    name: "Dynamics Business Central",
    category: "erp-finance",
    aliases: ["business central", "navision", "nav"],
    brandColor: "#002050",
    site: "dynamics.microsoft.com",
    auth: "oauth",
    docs: "https://learn.microsoft.com/dynamics365/business-central/dev-itpro/api-reference/v2.0/",
  },
  {
    id: "odoo",
    name: "Odoo",
    category: "erp-finance",
    brandColor: "#714B67",
    site: "odoo.com",
    auth: "api-key",
    docs: "https://www.odoo.com/documentation/master/developer/reference/external_api.html",
    note: "External API over XML-RPC or JSON-RPC; needs the database name alongside the credential.",
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    category: "erp-finance",
    aliases: ["intuit", "qbo"],
    brandColor: "#2CA01C",
    site: "quickbooks.intuit.com",
    auth: "oauth",
    docs: "https://developer.intuit.com/app/developer/qbo/docs/get-started",
    note: "Company realm id is required with the token; sandbox and production are separate.",
  },
  {
    id: "xero",
    name: "Xero",
    category: "erp-finance",
    brandColor: "#13B5EA",
    site: "xero.com",
    auth: "oauth",
    docs: "https://developer.xero.com/documentation/api/accounting/overview",
    note: "Tokens are per tenant; confirm which organisation to read.",
  },
  {
    id: "sage",
    name: "Sage",
    category: "erp-finance",
    aliases: ["sage intacct", "sage 50", "sage 200"],
    brandColor: "#00D639",
    site: "sage.com",
    auth: "api-key",
    docs: "https://developer.sage.com/",
    note: "Sage products have separate APIs; confirm the exact edition first.",
  },
  {
    id: "freshbooks",
    name: "FreshBooks",
    category: "erp-finance",
    brandColor: "#0075DD",
    site: "freshbooks.com",
    auth: "oauth",
    docs: "https://www.freshbooks.com/api/start",
  },
  {
    id: "zoho-books",
    name: "Zoho Books",
    category: "erp-finance",
    brandColor: "#E42527",
    site: "zoho.com/books",
    auth: "oauth",
    docs: "https://www.zoho.com/books/api/v3/introduction/",
  },
  {
    id: "ramp",
    name: "Ramp",
    category: "erp-finance",
    brandColor: "#F7DF4E",
    site: "ramp.com",
    auth: "oauth",
    docs: "https://docs.ramp.com/developer-api/v1/overview",
  },
  {
    id: "brex",
    name: "Brex",
    category: "erp-finance",
    brandColor: "#111111",
    site: "brex.com",
    auth: "api-key",
    docs: "https://developer.brex.com/",
  },
  {
    id: "expensify",
    name: "Expensify",
    category: "erp-finance",
    brandColor: "#0185FF",
    site: "expensify.com",
    auth: "api-key",
    docs: "https://integrations.expensify.com/Integration-Server/doc/",
  },
  {
    id: "bill",
    name: "BILL",
    category: "erp-finance",
    aliases: ["bill.com", "divvy"],
    brandColor: "#0F7A3D",
    site: "bill.com",
    auth: "api-key",
    docs: "https://developer.bill.com/docs/home",
  },

  // ------------------------------------------------------------- project-tracking
  {
    id: "jira",
    name: "Jira",
    category: "project-tracking",
    aliases: ["atlassian", "jira software", "jira service management"],
    brandColor: "#2684FF",
    site: "atlassian.com/software/jira",
    auth: "api-key",
    docs: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/",
    note: "Cloud uses an email plus API token over basic auth; JQL is the query surface.",
  },
  {
    id: "linear",
    name: "Linear",
    category: "project-tracking",
    brandColor: "#5E6AD2",
    site: "linear.app",
    auth: "api-key",
    docs: "https://linear.app/developers",
    note: "GraphQL only; a personal API key from Settings → API is enough for reads.",
  },
  {
    id: "asana",
    name: "Asana",
    category: "project-tracking",
    brandColor: "#F06A6A",
    site: "asana.com",
    auth: "oauth",
    docs: "https://developers.asana.com/docs",
  },
  {
    id: "monday",
    name: "monday.com",
    category: "project-tracking",
    aliases: ["monday com", "mondaydotcom"],
    brandColor: "#FF3D57",
    site: "monday.com",
    auth: "api-key",
    docs: "https://developer.monday.com/api-reference/docs",
    note: "GraphQL API; the board id matters more than the workspace.",
  },
  {
    id: "clickup",
    name: "ClickUp",
    category: "project-tracking",
    brandColor: "#7B68EE",
    site: "clickup.com",
    auth: "api-key",
    docs: "https://developer.clickup.com/docs",
  },
  {
    id: "trello",
    name: "Trello",
    category: "project-tracking",
    brandColor: "#0079BF",
    site: "trello.com",
    auth: "api-key",
    docs: "https://developer.atlassian.com/cloud/trello/rest/",
  },
  {
    id: "notion-projects",
    name: "Notion databases",
    category: "project-tracking",
    aliases: ["notion tasks", "notion board"],
    brandColor: "#111111",
    site: "notion.so",
    auth: "api-key",
    docs: "https://developers.notion.com/reference/intro",
    note: "Each database must be shared with the integration explicitly, one by one.",
  },
  {
    id: "smartsheet",
    name: "Smartsheet",
    category: "project-tracking",
    brandColor: "#003058",
    site: "smartsheet.com",
    auth: "api-key",
    docs: "https://smartsheet.redoc.ly/",
  },
  {
    id: "wrike",
    name: "Wrike",
    category: "project-tracking",
    brandColor: "#08CF65",
    site: "wrike.com",
    auth: "oauth",
    docs: "https://developers.wrike.com/",
  },
  {
    id: "basecamp",
    name: "Basecamp",
    category: "project-tracking",
    brandColor: "#1D2D35",
    site: "basecamp.com",
    auth: "oauth",
    docs: "https://github.com/basecamp/bc3-api",
  },
  {
    id: "shortcut",
    name: "Shortcut",
    category: "project-tracking",
    aliases: ["clubhouse"],
    brandColor: "#5B5BD6",
    site: "shortcut.com",
    auth: "api-key",
    docs: "https://developer.shortcut.com/api/rest/v3",
  },
  {
    id: "todoist",
    name: "Todoist",
    category: "project-tracking",
    brandColor: "#E44332",
    site: "todoist.com",
    auth: "api-key",
    docs: "https://developer.todoist.com/",
  },
  {
    id: "servicenow",
    name: "ServiceNow",
    category: "project-tracking",
    aliases: ["snow", "itsm"],
    brandColor: "#032D42",
    site: "servicenow.com",
    auth: "oauth",
    docs: "https://developer.servicenow.com/dev.do#!/reference/api",
    note: "Table API on the customer's own instance host; ask for the instance subdomain.",
  },

  // --------------------------------------------------------------- docs-knowledge
  {
    id: "notion",
    name: "Notion",
    category: "docs-knowledge",
    brandColor: "#111111",
    site: "notion.so",
    auth: "api-key",
    docs: "https://developers.notion.com/reference/intro",
    note: "Internal integration token; pages stay invisible until shared with it.",
  },
  {
    id: "confluence",
    name: "Confluence",
    category: "docs-knowledge",
    aliases: ["atlassian wiki"],
    brandColor: "#172B4D",
    site: "atlassian.com/software/confluence",
    auth: "api-key",
    docs: "https://developer.atlassian.com/cloud/confluence/rest/v2/intro/",
    note: "Same Atlassian API token as Jira; content comes back as storage-format markup.",
  },
  {
    id: "google-docs",
    name: "Google Docs",
    category: "docs-knowledge",
    brandColor: "#4285F4",
    site: "docs.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/docs/api/how-tos/overview",
  },
  {
    id: "microsoft-sharepoint",
    name: "SharePoint",
    category: "docs-knowledge",
    aliases: ["sharepoint online"],
    brandColor: "#038387",
    site: "sharepoint.com",
    auth: "oauth",
    docs: "https://learn.microsoft.com/graph/api/resources/sharepoint",
  },
  {
    id: "coda",
    name: "Coda",
    category: "docs-knowledge",
    brandColor: "#F46A54",
    site: "coda.io",
    auth: "api-key",
    docs: "https://coda.io/developers/apis/v1",
  },
  {
    id: "slite",
    name: "Slite",
    category: "docs-knowledge",
    brandColor: "#2E4FFF",
    site: "slite.com",
    auth: "api-key",
    docs: "https://developers.slite.com/",
  },
  {
    id: "guru",
    name: "Guru",
    category: "docs-knowledge",
    brandColor: "#F94E4E",
    site: "getguru.com",
    auth: "api-key",
    docs: "https://developer.getguru.com/",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    category: "docs-knowledge",
    brandColor: "#7C3AED",
    site: "obsidian.md",
    auth: "local-file",
    note: "A local Markdown vault; point Orion at the folder instead of an API.",
  },

  // ---------------------------------------------------------------- files-storage
  {
    id: "google-drive",
    name: "Google Drive",
    category: "files-storage",
    aliases: ["gdrive", "google workspace"],
    brandColor: "#1FA463",
    site: "drive.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/drive/api/guides/about-sdk",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    category: "files-storage",
    aliases: ["gsheets", "spreadsheet"],
    brandColor: "#0F9D58",
    site: "sheets.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/sheets/api/guides/concepts",
    note: "Reads need the spreadsheet id and the tab name, not just the file title.",
  },
  {
    id: "microsoft-onedrive",
    name: "OneDrive",
    category: "files-storage",
    brandColor: "#0078D4",
    site: "onedrive.com",
    auth: "oauth",
    docs: "https://learn.microsoft.com/graph/api/resources/onedrive",
  },
  {
    id: "microsoft-excel",
    name: "Excel",
    category: "files-storage",
    aliases: ["xlsx", "spreadsheet"],
    brandColor: "#217346",
    site: "microsoft.com/microsoft-365/excel",
    auth: "local-file",
    note: "Prefer reading the .xlsx file directly when it is on disk or in a synced folder.",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    category: "files-storage",
    brandColor: "#0061FF",
    site: "dropbox.com",
    auth: "oauth",
    docs: "https://www.dropbox.com/developers/documentation/http/overview",
  },
  {
    id: "box",
    name: "Box",
    category: "files-storage",
    brandColor: "#0061D5",
    site: "box.com",
    auth: "oauth",
    docs: "https://developer.box.com/reference/",
  },
  {
    id: "amazon-s3",
    name: "Amazon S3",
    category: "files-storage",
    aliases: ["aws s3", "s3 bucket"],
    brandColor: "#569A31",
    site: "aws.amazon.com/s3",
    auth: "api-key",
    docs: "https://docs.aws.amazon.com/s3/",
    note: "Prefer a scoped IAM role or profile already configured on this machine over pasted keys.",
  },

  // --------------------------------------------------------------------- data-bi
  {
    id: "snowflake",
    name: "Snowflake",
    category: "data-bi",
    brandColor: "#29B5E8",
    site: "snowflake.com",
    auth: "sql",
    docs: "https://docs.snowflake.com/en/developer-guide/python-connector/python-connector",
    note: "Needs account identifier, warehouse, database, schema, and role — not just a password.",
  },
  {
    id: "google-bigquery",
    name: "BigQuery",
    category: "data-bi",
    aliases: ["bq", "google cloud"],
    brandColor: "#4285F4",
    site: "cloud.google.com/bigquery",
    auth: "sql",
    docs: "https://cloud.google.com/bigquery/docs/reference/libraries",
    note: "Prefer application-default credentials already on this machine; always mind query cost.",
  },
  {
    id: "databricks",
    name: "Databricks",
    category: "data-bi",
    brandColor: "#FF3621",
    site: "databricks.com",
    auth: "sql",
    docs: "https://docs.databricks.com/dev-tools/index.html",
    note: "Workspace host plus a SQL warehouse http path.",
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    category: "data-bi",
    aliases: ["postgres", "rds"],
    brandColor: "#4169E1",
    site: "postgresql.org",
    auth: "sql",
    docs: "https://www.postgresql.org/docs/current/libpq-connect.html",
    note: "Ask for a read-only role. Note whether the host is reachable without a VPN or tunnel.",
  },
  {
    id: "mysql",
    name: "MySQL",
    category: "data-bi",
    aliases: ["mariadb"],
    brandColor: "#4479A1",
    site: "mysql.com",
    auth: "sql",
    docs: "https://dev.mysql.com/doc/",
  },
  {
    id: "microsoft-sql-server",
    name: "SQL Server",
    category: "data-bi",
    aliases: ["mssql", "azure sql", "t-sql"],
    brandColor: "#CC2927",
    site: "microsoft.com/sql-server",
    auth: "sql",
    docs: "https://learn.microsoft.com/sql/connect/homepage-sql-connection-programming",
  },
  {
    id: "amazon-redshift",
    name: "Amazon Redshift",
    category: "data-bi",
    aliases: ["redshift"],
    brandColor: "#8C4FFF",
    site: "aws.amazon.com/redshift",
    auth: "sql",
    docs: "https://docs.aws.amazon.com/redshift/latest/mgmt/welcome.html",
  },
  {
    id: "looker",
    name: "Looker",
    category: "data-bi",
    aliases: ["looker studio", "google data studio"],
    brandColor: "#5F6AC4",
    site: "looker.com",
    auth: "api-key",
    docs: "https://cloud.google.com/looker/docs/api-getting-started",
  },
  {
    id: "tableau",
    name: "Tableau",
    category: "data-bi",
    brandColor: "#E97627",
    site: "tableau.com",
    auth: "api-key",
    docs: "https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api.htm",
    note: "Personal access tokens are per site; the underlying data source is usually the better target.",
  },
  {
    id: "microsoft-power-bi",
    name: "Power BI",
    category: "data-bi",
    aliases: ["powerbi", "pbi"],
    brandColor: "#F2C811",
    site: "powerbi.microsoft.com",
    auth: "oauth",
    docs: "https://learn.microsoft.com/rest/api/power-bi/",
  },
  {
    id: "metabase",
    name: "Metabase",
    category: "data-bi",
    brandColor: "#509EE3",
    site: "metabase.com",
    auth: "api-key",
    docs: "https://www.metabase.com/docs/latest/api-documentation",
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "data-bi",
    brandColor: "#FCB400",
    site: "airtable.com",
    auth: "api-key",
    docs: "https://airtable.com/developers/web/api/introduction",
    note: "Personal access tokens are scoped per base; collect the base id too.",
  },
  {
    id: "dbt",
    name: "dbt",
    category: "data-bi",
    aliases: ["dbt cloud", "dbt core"],
    brandColor: "#FF694A",
    site: "getdbt.com",
    auth: "api-key",
    docs: "https://docs.getdbt.com/docs/dbt-cloud-apis/overview",
    note: "The dbt project's models and docs explain the warehouse better than the warehouse itself.",
  },

  // --------------------------------------------------------------------- support
  {
    id: "zendesk",
    name: "Zendesk",
    category: "support",
    brandColor: "#03363D",
    site: "zendesk.com",
    auth: "api-key",
    docs: "https://developer.zendesk.com/api-reference/",
    note: "Subdomain plus an email/token pair; the search endpoint is the fastest way in.",
  },
  {
    id: "intercom",
    name: "Intercom",
    category: "support",
    brandColor: "#1F8DED",
    site: "intercom.com",
    auth: "oauth",
    docs: "https://developers.intercom.com/docs/references/introduction",
  },
  {
    id: "freshdesk",
    name: "Freshdesk",
    category: "support",
    aliases: ["freshworks"],
    brandColor: "#25C16F",
    site: "freshdesk.com",
    auth: "api-key",
    docs: "https://developers.freshdesk.com/api/",
  },
  {
    id: "front",
    name: "Front",
    category: "support",
    aliases: ["frontapp", "shared inbox"],
    brandColor: "#001B38",
    site: "front.com",
    auth: "api-key",
    docs: "https://dev.frontapp.com/reference/introduction",
  },
  {
    id: "help-scout",
    name: "Help Scout",
    category: "support",
    brandColor: "#1292EE",
    site: "helpscout.com",
    auth: "oauth",
    docs: "https://developer.helpscout.com/mailbox-api/",
  },
  {
    id: "hubspot-service",
    name: "HubSpot Service Hub",
    category: "support",
    aliases: ["hubspot tickets"],
    brandColor: "#FF7A59",
    site: "hubspot.com/products/service",
    auth: "oauth",
    docs: "https://developers.hubspot.com/docs/api/crm/tickets",
  },
  {
    id: "crisp",
    name: "Crisp",
    category: "support",
    brandColor: "#1972F5",
    site: "crisp.chat",
    auth: "api-key",
    docs: "https://docs.crisp.chat/references/rest-api/v1/",
  },

  // ---------------------------------------------------------- marketing-analytics
  {
    id: "google-analytics",
    name: "Google Analytics",
    category: "marketing-analytics",
    aliases: ["ga4", "analytics"],
    brandColor: "#E37400",
    site: "analytics.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    note: "GA4 reads need the numeric property id, which is not the measurement id.",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    category: "marketing-analytics",
    aliases: ["adwords", "ppc"],
    brandColor: "#4285F4",
    site: "ads.google.com",
    auth: "oauth",
    docs: "https://developers.google.com/google-ads/api/docs/start",
    note: "Requires a developer token approved by Google plus the customer id.",
  },
  {
    id: "meta-ads",
    name: "Meta Ads",
    category: "marketing-analytics",
    aliases: ["facebook ads", "instagram ads", "meta business"],
    brandColor: "#0866FF",
    site: "business.facebook.com",
    auth: "oauth",
    docs: "https://developers.facebook.com/docs/marketing-apis/",
  },
  {
    id: "linkedin-ads",
    name: "LinkedIn Ads",
    category: "marketing-analytics",
    aliases: ["linkedin campaign manager"],
    brandColor: "#0A66C2",
    site: "linkedin.com/campaignmanager",
    auth: "oauth",
    docs: "https://learn.microsoft.com/linkedin/marketing/",
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    category: "marketing-analytics",
    brandColor: "#FFE01B",
    site: "mailchimp.com",
    auth: "api-key",
    docs: "https://mailchimp.com/developer/marketing/api/",
    note: "The datacenter suffix on the key (for example us14) is part of the base URL.",
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    category: "marketing-analytics",
    brandColor: "#232426",
    site: "klaviyo.com",
    auth: "api-key",
    docs: "https://developers.klaviyo.com/en/reference/api_overview",
  },
  {
    id: "hubspot-marketing",
    name: "HubSpot Marketing",
    category: "marketing-analytics",
    brandColor: "#FF7A59",
    site: "hubspot.com/products/marketing",
    auth: "oauth",
    docs: "https://developers.hubspot.com/docs/api/marketing-api",
  },
  {
    id: "posthog",
    name: "PostHog",
    category: "marketing-analytics",
    brandColor: "#F54E00",
    site: "posthog.com",
    auth: "api-key",
    docs: "https://posthog.com/docs/api",
    note: "Reads need a personal API key and the project id; note EU vs US host.",
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    category: "marketing-analytics",
    brandColor: "#7856FF",
    site: "mixpanel.com",
    auth: "api-key",
    docs: "https://developer.mixpanel.com/reference/overview",
  },
  {
    id: "amplitude",
    name: "Amplitude",
    category: "marketing-analytics",
    brandColor: "#1E61F0",
    site: "amplitude.com",
    auth: "api-key",
    docs: "https://amplitude.com/docs/apis",
  },
  {
    id: "segment",
    name: "Segment",
    category: "marketing-analytics",
    aliases: ["twilio segment", "cdp"],
    brandColor: "#52BD95",
    site: "segment.com",
    auth: "api-key",
    docs: "https://segment.com/docs/api/",
  },
  {
    id: "semrush",
    name: "Semrush",
    category: "marketing-analytics",
    aliases: ["seo"],
    brandColor: "#FF642D",
    site: "semrush.com",
    auth: "api-key",
    docs: "https://developer.semrush.com/api/",
  },

  // -------------------------------------------------------------------- hr-people
  {
    id: "workday",
    name: "Workday",
    category: "hr-people",
    brandColor: "#F68D2E",
    site: "workday.com",
    auth: "oauth",
    docs: "https://community.workday.com/api",
    note: "Tenant-specific endpoints; most customers expose reports-as-a-service rather than raw APIs.",
  },
  {
    id: "bamboohr",
    name: "BambooHR",
    category: "hr-people",
    brandColor: "#73C41D",
    site: "bamboohr.com",
    auth: "api-key",
    docs: "https://documentation.bamboohr.com/docs",
  },
  {
    id: "rippling",
    name: "Rippling",
    category: "hr-people",
    brandColor: "#FFC53D",
    site: "rippling.com",
    auth: "api-key",
    docs: "https://developer.rippling.com/",
  },
  {
    id: "gusto",
    name: "Gusto",
    category: "hr-people",
    brandColor: "#F45D48",
    site: "gusto.com",
    auth: "oauth",
    docs: "https://docs.gusto.com/",
  },
  {
    id: "deel",
    name: "Deel",
    category: "hr-people",
    brandColor: "#1755F4",
    site: "deel.com",
    auth: "api-key",
    docs: "https://developer.deel.com/",
  },
  {
    id: "hibob",
    name: "HiBob",
    category: "hr-people",
    aliases: ["bob"],
    brandColor: "#E4185C",
    site: "hibob.com",
    auth: "api-key",
    docs: "https://apidocs.hibob.com/",
  },
  {
    id: "personio",
    name: "Personio",
    category: "hr-people",
    brandColor: "#0056B3",
    site: "personio.com",
    auth: "api-key",
    docs: "https://developer.personio.de/",
  },
  {
    id: "adp",
    name: "ADP",
    category: "hr-people",
    brandColor: "#D0271D",
    site: "adp.com",
    auth: "oauth",
    docs: "https://developers.adp.com/",
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    category: "hr-people",
    aliases: ["ats", "recruiting"],
    brandColor: "#24A47F",
    site: "greenhouse.io",
    auth: "api-key",
    docs: "https://developers.greenhouse.io/harvest.html",
  },
  {
    id: "lever",
    name: "Lever",
    category: "hr-people",
    brandColor: "#5F41E3",
    site: "lever.co",
    auth: "api-key",
    docs: "https://hire.lever.co/developer/documentation",
  },

  // ----------------------------------------------------------- commerce-payments
  {
    id: "shopify",
    name: "Shopify",
    category: "commerce-payments",
    brandColor: "#7AB55C",
    site: "shopify.com",
    auth: "oauth",
    docs: "https://shopify.dev/docs/api/admin-graphql",
    note: "Admin GraphQL API with a custom app token scoped per store domain.",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "commerce-payments",
    brandColor: "#635BFF",
    site: "stripe.com",
    auth: "api-key",
    docs: "https://docs.stripe.com/api",
    note: "Use a restricted read-only key. Test and live modes hold different data.",
  },
  {
    id: "paypal",
    name: "PayPal",
    category: "commerce-payments",
    brandColor: "#003087",
    site: "paypal.com",
    auth: "oauth",
    docs: "https://developer.paypal.com/api/rest/",
  },
  {
    id: "square",
    name: "Square",
    category: "commerce-payments",
    brandColor: "#3E4348",
    site: "squareup.com",
    auth: "oauth",
    docs: "https://developer.squareup.com/reference/square",
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    category: "commerce-payments",
    aliases: ["woo", "wordpress store"],
    brandColor: "#7F54B3",
    site: "woocommerce.com",
    auth: "api-key",
    docs: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
  },
  {
    id: "amazon-seller-central",
    name: "Amazon Seller Central",
    category: "commerce-payments",
    aliases: ["amazon sp-api", "fba"],
    brandColor: "#FF9900",
    site: "sellercentral.amazon.com",
    auth: "oauth",
    docs: "https://developer-docs.amazon.com/sp-api/",
  },
  {
    id: "bigcommerce",
    name: "BigCommerce",
    category: "commerce-payments",
    brandColor: "#121118",
    site: "bigcommerce.com",
    auth: "api-key",
    docs: "https://developer.bigcommerce.com/docs/rest",
  },
  {
    id: "chargebee",
    name: "Chargebee",
    category: "commerce-payments",
    aliases: ["billing", "subscriptions"],
    brandColor: "#FF3300",
    site: "chargebee.com",
    auth: "api-key",
    docs: "https://apidocs.chargebee.com/docs/api",
  },

  // ----------------------------------------------------------------- engineering
  {
    id: "github",
    name: "GitHub",
    category: "engineering",
    brandColor: "#181717",
    site: "github.com",
    auth: "api-key",
    docs: "https://docs.github.com/rest",
    note: "The `gh` CLI is often already authenticated on this machine; prefer it over a raw token.",
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "engineering",
    brandColor: "#FC6D26",
    site: "gitlab.com",
    auth: "api-key",
    docs: "https://docs.gitlab.com/ee/api/rest/",
  },
  {
    id: "sentry",
    name: "Sentry",
    category: "engineering",
    brandColor: "#362D59",
    site: "sentry.io",
    auth: "api-key",
    docs: "https://docs.sentry.io/api/",
  },
  {
    id: "datadog",
    name: "Datadog",
    category: "engineering",
    brandColor: "#632CA6",
    site: "datadoghq.com",
    auth: "api-key",
    docs: "https://docs.datadoghq.com/api/latest/",
    note: "Needs both an API key and an application key, plus the correct site (US/EU).",
  },
  {
    id: "figma",
    name: "Figma",
    category: "engineering",
    brandColor: "#F24E1E",
    site: "figma.com",
    auth: "api-key",
    docs: "https://www.figma.com/developers/api",
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "engineering",
    brandColor: "#000000",
    site: "vercel.com",
    auth: "api-key",
    docs: "https://vercel.com/docs/rest-api",
  },
  {
    id: "amazon-web-services",
    name: "AWS",
    category: "engineering",
    aliases: ["amazon web services"],
    brandColor: "#FF9900",
    site: "aws.amazon.com",
    auth: "api-key",
    docs: "https://docs.aws.amazon.com/cli/",
    note: "Prefer a named profile already configured in the AWS CLI over pasted credentials.",
  },
  {
    id: "microsoft-azure",
    name: "Azure",
    category: "engineering",
    brandColor: "#0078D4",
    site: "azure.microsoft.com",
    auth: "oauth",
    docs: "https://learn.microsoft.com/rest/api/azure/",
  },
  {
    id: "google-cloud",
    name: "Google Cloud",
    category: "engineering",
    aliases: ["gcp"],
    brandColor: "#4285F4",
    site: "cloud.google.com",
    auth: "oauth",
    docs: "https://cloud.google.com/docs/authentication",
  },
];

/** Lookup from tool id to catalog entry. */
const TOOLS_BY_ID: ReadonlyMap<string, BusinessTool> = new Map(
  BUSINESS_TOOLS.map((tool) => [tool.id, tool]),
);

/** Returns the catalog entry for a persisted tool id, when it still exists. */
export function findBusinessTool(id: string): BusinessTool | undefined {
  return TOOLS_BY_ID.get(id);
}

/** Returns every tool belonging to one question step, in catalog order. */
export function getBusinessToolsForCategory(
  category: BusinessToolCategoryId,
): BusinessTool[] {
  return BUSINESS_TOOLS.filter((tool) => tool.category === category);
}

/** Returns the question step definition for an id. */
export function findBusinessToolCategory(
  id: BusinessToolCategoryId,
): BusinessToolCategory | undefined {
  return BUSINESS_TOOL_CATEGORIES.find((category) => category.id === id);
}

/** Maximum length of one user-typed tool name. */
export const MAX_CUSTOM_TOOL_NAME_CHARS = 60;

/** Maximum number of user-typed tools per question step. */
export const MAX_CUSTOM_TOOLS_PER_CATEGORY = 10;

export const BusinessStackCategorySelectionSchema = z.object({
  /** Catalog ids the user picked for this step. */
  toolIds: z.array(z.string().min(1).max(100)).max(200),
  /** Free-text tools the user typed because they were not in the catalog. */
  customTools: z
    .array(z.string().min(1).max(MAX_CUSTOM_TOOL_NAME_CHARS))
    .max(MAX_CUSTOM_TOOLS_PER_CATEGORY),
  /** True when the user explicitly answered "none of these". */
  none: z.boolean().default(false),
});

/**
 * Answers keyed by question step id, each optional so a partially finished
 * interview round-trips. Built from the id tuple rather than `z.record` so the
 * inferred type keeps one optional key per known category.
 */
const BusinessStackCategoriesSchema = z.object(
  Object.fromEntries(
    BUSINESS_TOOL_CATEGORY_IDS.map((id) => [
      id,
      BusinessStackCategorySelectionSchema.optional(),
    ]),
  ) as Record<
    BusinessToolCategoryId,
    z.ZodOptional<typeof BusinessStackCategorySelectionSchema>
  >,
);

export const BusinessStackSelectionSchema = z.object({
  version: z.literal(1),
  categories: BusinessStackCategoriesSchema.default({}),
  /** Set when the user leaves the picker, even with nothing selected. */
  completedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
});

export type BusinessStackCategorySelection = z.infer<
  typeof BusinessStackCategorySelectionSchema
>;
export type BusinessStackSelection = z.infer<typeof BusinessStackSelectionSchema>;

/** Returns an empty selection with a current timestamp. */
export function createEmptyBusinessStackSelection(): BusinessStackSelection {
  return { version: 1, categories: {}, updatedAt: new Date().toISOString() };
}

/** Returns the number of question steps that have an explicit answer. */
export function countAnsweredCategories(selection: BusinessStackSelection): number {
  return BUSINESS_TOOL_CATEGORIES.filter((category) => {
    const answer = selection.categories[category.id];
    if (!answer) return false;
    return answer.none || answer.toolIds.length > 0 || answer.customTools.length > 0;
  }).length;
}

/** Returns every selected catalog tool across all steps, in catalog order. */
export function listSelectedBusinessTools(
  selection: BusinessStackSelection,
): BusinessTool[] {
  const selected = new Set<string>();
  for (const answer of Object.values(selection.categories)) {
    for (const id of answer.toolIds) {
      if (!DEPRECATED_BUSINESS_TOOL_IDS.includes(id as (typeof DEPRECATED_BUSINESS_TOOL_IDS)[number])) {
        selected.add(id);
      }
    }
  }
  return BUSINESS_TOOLS.filter((tool) => selected.has(tool.id));
}

/** Normalizes a string for accent- and case-insensitive substring matching. */
function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ranks tools against a free-text query.
 *
 * Scoring favors, in order: exact name match, name prefix, name substring,
 * alias match, then domain match. Ties keep catalog order, which is roughly
 * popularity, so the common answer stays on top.
 */
export function searchBusinessTools(
  query: string,
  options: { category?: BusinessToolCategoryId; limit?: number } = {},
): BusinessTool[] {
  const pool = options.category
    ? getBusinessToolsForCategory(options.category)
    : [...BUSINESS_TOOLS];
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) {
    return options.limit ? pool.slice(0, options.limit) : pool;
  }

  const scored: Array<{ tool: BusinessTool; score: number; order: number }> = [];
  pool.forEach((tool, order) => {
    const name = normalizeForSearch(tool.name);
    const id = normalizeForSearch(tool.id);
    let score = 0;
    if (name === normalizedQuery || id === normalizedQuery) {
      score = 100;
    } else if (name.startsWith(normalizedQuery) || id.startsWith(normalizedQuery)) {
      score = 80;
    } else if (name.includes(normalizedQuery) || id.includes(normalizedQuery)) {
      score = 60;
    } else if (
      tool.aliases?.some((alias) => normalizeForSearch(alias).includes(normalizedQuery))
    ) {
      score = 40;
    } else if (normalizeForSearch(tool.site).includes(normalizedQuery)) {
      score = 20;
    }
    if (score > 0) scored.push({ tool, score, order });
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const results = scored.map((entry) => entry.tool);
  return options.limit ? results.slice(0, options.limit) : results;
}
