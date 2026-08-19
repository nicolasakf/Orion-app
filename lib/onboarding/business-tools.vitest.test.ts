import { readdirSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import {
  BUSINESS_TOOL_CATEGORIES,
  BUSINESS_TOOL_CATEGORY_IDS,
  BUSINESS_TOOLS,
  BusinessStackSelectionSchema,
  countAnsweredCategories,
  createEmptyBusinessStackSelection,
  findBusinessTool,
  getBusinessToolsForCategory,
  listSelectedBusinessTools,
  searchBusinessTools,
} from "@/lib/onboarding/business-tools";
import { TOOL_LOGO_IDS, hasToolLogo } from "@/lib/onboarding/tool-logos.generated";

describe("business tool catalog", () => {
  it("has unique ids", () => {
    const ids = BUSINESS_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns every tool to a known category", () => {
    const known = new Set<string>(BUSINESS_TOOL_CATEGORY_IDS);
    for (const tool of BUSINESS_TOOLS) {
      expect(known.has(tool.category)).toBe(true);
    }
  });

  it("gives every category at least three options", () => {
    for (const category of BUSINESS_TOOL_CATEGORIES) {
      expect(getBusinessToolsForCategory(category.id).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("defines one question step per category id, in order", () => {
    expect(BUSINESS_TOOL_CATEGORIES.map((category) => category.id)).toEqual([
      ...BUSINESS_TOOL_CATEGORY_IDS,
    ]);
  });

  it("uses six-digit hex brand colours", () => {
    for (const tool of BUSINESS_TOOLS) {
      expect(tool.brandColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("points documentation links at https", () => {
    for (const tool of BUSINESS_TOOLS) {
      if (tool.docs) expect(tool.docs.startsWith("https://")).toBe(true);
    }
  });

  it("does not ask users to pick local folders as a cloud tool", () => {
    expect(BUSINESS_TOOLS.some((tool) => tool.id === "sharefile-local")).toBe(false);
    const filesStorage = BUSINESS_TOOL_CATEGORIES.find(
      (category) => category.id === "files-storage",
    );
    expect(filesStorage?.hint).not.toMatch(/this computer/i);
    expect(filesStorage?.noneLabel).not.toMatch(/local folder/i);
  });
});

describe("tool logo manifest", () => {
  it("only lists ids that exist in the catalog", () => {
    const catalogIds = new Set(BUSINESS_TOOLS.map((tool) => tool.id));
    for (const id of TOOL_LOGO_IDS) {
      expect(catalogIds.has(id)).toBe(true);
    }
  });

  it("matches the committed SVG files", () => {
    const directory = path.resolve(__dirname, "../../public/assets/tool-logos");
    const files = readdirSync(directory)
      .filter((name) => name.endsWith(".svg"))
      .map((name) => name.slice(0, -4))
      .sort();
    expect([...TOOL_LOGO_IDS].sort()).toEqual(files);
    for (const id of files) expect(hasToolLogo(id)).toBe(true);
  });
});

describe("searchBusinessTools", () => {
  it("ranks an exact name above a substring match", () => {
    const results = searchBusinessTools("linear");
    expect(results[0]?.id).toBe("linear");
  });

  it("matches aliases the catalog name does not contain", () => {
    expect(searchBusinessTools("ga4").map((tool) => tool.id)).toContain(
      "google-analytics",
    );
    expect(searchBusinessTools("sfdc").map((tool) => tool.id)).toContain("salesforce");
    expect(searchBusinessTools("o365").map((tool) => tool.id)).toContain(
      "microsoft-teams",
    );
  });

  it("ignores punctuation and case", () => {
    expect(searchBusinessTools("monday.com").map((tool) => tool.id)).toContain("monday");
    expect(searchBusinessTools("  HUBSPOT ").map((tool) => tool.id)).toContain("hubspot");
  });

  it("scopes results to one category when asked", () => {
    const results = searchBusinessTools("hubspot", { category: "support" });
    expect(results.map((tool) => tool.id)).toEqual(["hubspot-service"]);
  });

  it("returns the full category in catalog order for an empty query", () => {
    expect(searchBusinessTools("   ", { category: "crm" })).toEqual(
      getBusinessToolsForCategory("crm"),
    );
  });

  it("respects the result limit", () => {
    expect(searchBusinessTools("google", { limit: 2 })).toHaveLength(2);
  });
});

describe("stack selection", () => {
  it("round-trips through its schema", () => {
    const selection = {
      ...createEmptyBusinessStackSelection(),
      categories: {
        communication: { toolIds: ["slack"], customTools: ["Twist"], none: false },
      },
    };
    expect(BusinessStackSelectionSchema.parse(selection)).toEqual(selection);
  });

  it("counts an explicit none answer as answered", () => {
    const selection = createEmptyBusinessStackSelection();
    expect(countAnsweredCategories(selection)).toBe(0);
    selection.categories.crm = { toolIds: [], customTools: [], none: true };
    expect(countAnsweredCategories(selection)).toBe(1);
  });

  it("does not count an emptied answer", () => {
    const selection = createEmptyBusinessStackSelection();
    selection.categories.crm = { toolIds: [], customTools: [], none: false };
    expect(countAnsweredCategories(selection)).toBe(0);
  });

  it("lists selected tools in catalog order across categories", () => {
    const selection = createEmptyBusinessStackSelection();
    selection.categories.engineering = {
      toolIds: ["gitlab", "github"],
      customTools: [],
      none: false,
    };
    selection.categories.communication = {
      toolIds: ["slack"],
      customTools: [],
      none: false,
    };
    expect(listSelectedBusinessTools(selection).map((tool) => tool.id)).toEqual([
      "slack",
      "github",
      "gitlab",
    ]);
  });

  it("returns undefined for unknown tool ids", () => {
    expect(findBusinessTool("not-a-real-tool")).toBeUndefined();
  });
});
