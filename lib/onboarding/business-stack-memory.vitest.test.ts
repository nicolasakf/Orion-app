import { describe, expect, it } from "vitest";

import {
  BUSINESS_STACK_HEADING,
  BUSINESS_TOOL_CONNECTION_PLAYBOOK,
  buildBusinessStackInterviewSummary,
  buildBusinessStackMemorySection,
} from "@/lib/onboarding/business-stack-memory";
import {
  createEmptyBusinessStackSelection,
  type BusinessStackSelection,
} from "@/lib/onboarding/business-tools";

/** Builds a selection with the given per-category answers. */
function selectionWith(
  categories: BusinessStackSelection["categories"],
): BusinessStackSelection {
  return { ...createEmptyBusinessStackSelection(), categories };
}

describe("buildBusinessStackMemorySection", () => {
  it("returns nothing when the user answered nothing", () => {
    expect(buildBusinessStackMemorySection(createEmptyBusinessStackSelection())).toBe("");
  });

  it("lists picked tools with their auth shape and docs link", () => {
    const section = buildBusinessStackMemorySection(
      selectionWith({
        communication: { toolIds: ["slack"], customTools: [], none: false },
      }),
    );
    expect(section).toContain(BUSINESS_STACK_HEADING);
    expect(section).toContain("### Communication");
    expect(section).toContain("**Slack**");
    expect(section).toContain("OAuth app / user consent");
    expect(section).toContain("https://api.slack.com/web");
  });

  it("flags user-typed tools as outside the catalog", () => {
    const section = buildBusinessStackMemorySection(
      selectionWith({
        crm: { toolIds: [], customTools: ["Acme CRM"], none: false },
      }),
    );
    expect(section).toContain("**Acme CRM**");
    expect(section).toContain("not in Orion's catalog");
  });

  it("records an explicit none answer instead of dropping the category", () => {
    const section = buildBusinessStackMemorySection(
      selectionWith({ crm: { toolIds: [], customTools: [], none: true } }),
    );
    expect(section).toContain("### CRM & sales");
    expect(section).toContain("None.");
  });

  it("keeps unknown ids visible rather than silently discarding them", () => {
    const section = buildBusinessStackMemorySection(
      selectionWith({
        crm: { toolIds: ["retired-tool"], customTools: [], none: false },
      }),
    );
    expect(section).toContain("Unrecognized selections");
    expect(section).toContain("retired-tool");
  });

  it("drops deprecated tool ids from saved selections", () => {
    const section = buildBusinessStackMemorySection(
      selectionWith({
        "files-storage": {
          toolIds: ["sharefile-local", "google-drive"],
          customTools: [],
          none: false,
        },
      }),
    );
    expect(section).toContain("**Google Drive**");
    expect(section).not.toContain("folder on this computer");
    expect(section).not.toContain("Unrecognized selections");
  });

  it("omits categories the user never reached", () => {
    const section = buildBusinessStackMemorySection(
      selectionWith({
        communication: { toolIds: ["slack"], customTools: [], none: false },
      }),
    );
    expect(section).not.toContain("### HR & people");
  });

  it("never emits a credential-shaped string", () => {
    const section = buildBusinessStackMemorySection(
      selectionWith({
        engineering: { toolIds: ["github", "datadog"], customTools: [], none: false },
      }),
    );
    expect(section).not.toMatch(/\bghp_|\bsk-|BEGIN [A-Z ]*PRIVATE KEY/);
  });
});

describe("BUSINESS_TOOL_CONNECTION_PLAYBOOK", () => {
  it("tells the agent to record working connections as a user-level skill", () => {
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain(
      ".agents/skills/<tool-id>/SKILL.md",
    );
  });

  it("forbids taking secrets through chat", () => {
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain("Never accept a secret in chat");
  });

  it("treats local files as always available on this machine", () => {
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain("Local files on this machine");
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain("Jupyter root");
  });

  it("names only routes Orion actually implements", () => {
    // Regression guard for chat session 1787157858728, where the playbook sent
    // the agent to an MCP connector and a stored-credential route that did not
    // exist, and it filled the gap by inventing a "Data Sources" panel.
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).not.toMatch(/\bMCP\b/);
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain("`connections` tool");
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain("action `list`");
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain("action `request`");
  });

  it("forbids inventing a navigation path the agent has not been told about", () => {
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain(
      "do not describe a button or panel you have not",
    );
  });

  it("points notebook code at the broker rather than at raw secrets", () => {
    expect(BUSINESS_TOOL_CONNECTION_PLAYBOOK).toContain(
      'orion_ui.connections.get("<id>")',
    );
  });

  it("stays small enough to sit inside the personal-context budget", () => {
    expect(Buffer.byteLength(BUSINESS_TOOL_CONNECTION_PLAYBOOK, "utf8")).toBeLessThan(
      4 * 1024,
    );
  });
});

describe("buildBusinessStackInterviewSummary", () => {
  it("returns nothing when the user answered nothing", () => {
    expect(buildBusinessStackInterviewSummary(createEmptyBusinessStackSelection())).toBe(
      "",
    );
  });

  it("names the picked tools and tells the interviewer not to re-ask", () => {
    const summary = buildBusinessStackInterviewSummary(
      selectionWith({
        communication: { toolIds: ["slack"], customTools: [], none: false },
        crm: { toolIds: ["hubspot"], customTools: ["Acme CRM"], none: false },
      }),
    );
    expect(summary).toContain("Do not ask about these again");
    expect(summary).toContain("Communication: Slack");
    expect(summary).toContain("CRM & sales: HubSpot, Acme CRM");
  });

  it("reports skipped categories so the interviewer can probe them", () => {
    const summary = buildBusinessStackInterviewSummary(
      selectionWith({
        communication: { toolIds: ["slack"], customTools: [], none: false },
      }),
    );
    expect(summary).toContain("They skipped these categories:");
    expect(summary).toContain("HR & people");
  });

  it("stays far shorter than the memory section it summarizes", () => {
    const selection = selectionWith({
      communication: { toolIds: ["slack", "zoom", "gmail"], customTools: [], none: false },
      crm: { toolIds: ["salesforce", "hubspot"], customTools: [], none: false },
    });
    expect(buildBusinessStackInterviewSummary(selection).length).toBeLessThan(
      buildBusinessStackMemorySection(selection).length,
    );
  });
});
