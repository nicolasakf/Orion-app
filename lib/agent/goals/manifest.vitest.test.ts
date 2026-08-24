import { describe, expect, it } from "vitest";

import { buildGoalArtifactManifest, matchesGoalDeliverable } from "./manifest";

describe("goal artifact manifests", () => {
  it("matches exact and recursive deliverable patterns", () => {
    expect(matchesGoalDeliverable("report.ipynb", "report.ipynb")).toBe(true);
    expect(matchesGoalDeliverable("reports/final/report.md", "reports/**/*.md")).toBe(true);
    expect(matchesGoalDeliverable("reports/report.md", "reports/**/*.md")).toBe(true);
    expect(matchesGoalDeliverable("reports/final/report.csv", "reports/**/*.md")).toBe(false);
  });

  it("reports changed files and matched deliverables", () => {
    const manifest = buildGoalArtifactManifest({
      rootPath: "project",
      baselineEntries: [{
        path: "project/report.ipynb",
        kind: "notebook",
        size: 10,
        lastModified: "before",
      }],
      currentEntries: [
        {
          path: "project/report.ipynb",
          kind: "notebook",
          size: 20,
          lastModified: "after",
        },
        {
          path: "project/summary.md",
          kind: "file",
          size: 5,
          lastModified: "after",
        },
      ],
      deliverables: [
        { path: "report.ipynb", description: "Notebook" },
        { path: "*.md", description: "Summary" },
      ],
      capturedAt: "2026-08-20T12:00:00.000Z",
    });
    expect(manifest.modifiedPaths).toEqual(["project/report.ipynb"]);
    expect(manifest.createdPaths).toEqual(["project/summary.md"]);
    expect(manifest.deliverablePaths).toEqual([
      "project/report.ipynb",
      "project/summary.md",
    ]);
  });
});
