import type { ContentsManager } from "@jupyterlab/services";
import { describe, expect, it, vi } from "vitest";

import {
  buildGoalArtifactManifest,
  matchesGoalDeliverable,
  scanGoalWorkspace,
} from "./manifest";

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

  it("does not report unscanned baseline files as deleted when truncated", () => {
    const manifest = buildGoalArtifactManifest({
      baselineEntries: [{
        path: "old.csv",
        kind: "file",
        size: 10,
        lastModified: "before",
      }],
      currentEntries: [],
      deliverables: [{ path: "report.md", description: "Report" }],
      truncated: true,
      capturedAt: "2026-08-20T12:00:00.000Z",
    });

    expect(manifest.deletedPaths).toEqual([]);
    expect(manifest.fingerprint).toBe(
      buildGoalArtifactManifest({
        baselineEntries: [],
        currentEntries: [],
        deliverables: [],
        truncated: true,
        capturedAt: "2026-08-20T12:00:00.000Z",
      }).fingerprint,
    );
  });

  it("keeps the deliverable fingerprint stable while scratch files churn", () => {
    const baselineEntries = [
      { path: "workspace/report.md", kind: "file" as const, size: 10, lastModified: "t0" },
    ];
    const deliverables = [{ path: "report.md", description: "Report" }];
    const build = (notesModified: string) =>
      buildGoalArtifactManifest({
        baselineEntries,
        currentEntries: [
          { path: "workspace/report.md", kind: "file", size: 10, lastModified: "t0" },
          { path: "workspace/_notes/log.json", kind: "file", size: 4, lastModified: notesModified },
        ],
        deliverables,
        rootPath: "workspace",
      });

    const first = build("t1");
    const second = build("t2");
    // Rewriting a scratch note moves the whole-diff fingerprint, which is exactly
    // how an untouched deliverable used to escape stall detection.
    expect(second.fingerprint).not.toBe(first.fingerprint);
    expect(second.deliverableFingerprint).toBe(first.deliverableFingerprint);

    const edited = buildGoalArtifactManifest({
      baselineEntries,
      currentEntries: [
        { path: "workspace/report.md", kind: "file", size: 40, lastModified: "t3" },
      ],
      deliverables,
      rootPath: "workspace",
    });
    expect(edited.deliverableFingerprint).not.toBe(first.deliverableFingerprint);
  });

  it("reads explicit deliverables before a truncated general workspace scan", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "workspace/report.md") {
        return {
          name: "report.md",
          path,
          type: "file",
          size: 25,
          last_modified: "after",
        };
      }
      return {
        name: "workspace",
        path: "workspace",
        type: "directory",
        content: [{
          name: "unrelated.csv",
          path: "workspace/unrelated.csv",
          type: "file",
          size: 100,
          last_modified: "after",
        }],
      };
    });
    const result = await scanGoalWorkspace({
      contents: { get } as unknown as ContentsManager,
      rootPath: "workspace",
      deliverables: [{ path: "report.md", description: "Report" }],
      maxEntries: 1,
    });

    expect(result.truncated).toBe(true);
    expect(result.entries.map((entry) => entry.path)).toContain("workspace/report.md");
    expect(get.mock.calls[0]?.[0]).toBe("workspace/report.md");
  });
});
