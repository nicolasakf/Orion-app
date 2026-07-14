import { describe, expect, it, vi } from "vitest";
import type { ContentsManager } from "@jupyterlab/services";

import {
  WorkspaceSearchService,
  WORKSPACE_SEARCH_MAX_CANDIDATE_FILES,
  WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES,
  WORKSPACE_SEARCH_MAX_TOTAL_TEXT_BYTES,
} from "@/lib/workspace/workspace-search-service";

interface FixtureModel {
  type: "directory" | "file" | "notebook";
  content: unknown;
  format?: "json" | "text" | "base64" | null;
  size?: number;
}

interface FixtureEntry {
  name: string;
  path: string;
  type: "directory" | "file" | "notebook";
  size?: number;
}

interface ContentsFixture {
  manager: ContentsManager;
  get: ReturnType<typeof vi.fn>;
}

/** Builds a minimal directory model fixture accepted by Jupyter ContentsManager. */
function directory(entries: FixtureEntry[]): FixtureModel {
  return { type: "directory", content: entries, format: "json" };
}

/** Builds a text-file model fixture with a size that mirrors a Contents response. */
function textFile(content: string, size = content.length): FixtureModel {
  return { type: "file", content, format: "text", size };
}

/** Builds one entry from a Jupyter-root-relative path. */
function entry(
  name: string,
  path: string,
  type: FixtureEntry["type"],
  size?: number
): FixtureEntry {
  return { name, path, type, ...(size !== undefined ? { size } : {}) };
}

/** Creates a ContentsManager test double and records every requested path. */
function createContentsFixture(
  models: Record<string, FixtureModel>,
  failedPaths: ReadonlySet<string> = new Set()
): ContentsFixture {
  const get = vi.fn(async (path: string) => {
    if (failedPaths.has(path)) {
      throw new Error(`Failed to read ${path}`);
    }

    const model = models[path];
    if (!model) throw new Error(`404: ${path}`);

    return {
      name: path.split("/").filter(Boolean).at(-1) ?? "root",
      path,
      writable: true,
      created: "",
      last_modified: "",
      mimetype: "text/plain",
      ...model,
    };
  });

  return {
    manager: { get } as unknown as ContentsManager,
    get,
  };
}

/** Returns the number of times a fixture requested a particular Contents path. */
function requestCount(get: ReturnType<typeof vi.fn>, path: string): number {
  return get.mock.calls.filter(([requestedPath]) => requestedPath === path).length;
}

describe("WorkspaceSearchService", () => {
  it("recursively finds literal filename and content matches while skipping ignored and binary entries", async () => {
    const fixture = createContentsFixture({
      project: directory([
        entry("src", "project/src", "directory"),
        entry("node_modules", "project/node_modules", "directory"),
        entry("logo.png", "project/logo.png", "file", 20),
      ]),
      "project/src": directory([
        entry("Needle.ts", "project/src/Needle.ts", "file", 16),
        entry("notes.txt", "project/src/notes.txt", "file", 34),
      ]),
      "project/src/Needle.ts": textFile("export const value"),
      "project/src/notes.txt": textFile("first line\nA literal Needle appears here"),
      "project/node_modules": directory([
        entry("needle.js", "project/node_modules/needle.js", "file", 12),
      ]),
      "project/node_modules/needle.js": textFile("Needle"),
      "project/logo.png": {
        type: "file",
        content: "binary",
        format: "base64",
        size: 20,
      },
    });
    const service = new WorkspaceSearchService(fixture.manager);

    const result = await service.searchWorkspace({
      rootPath: "project",
      query: "needle",
      caseSensitive: false,
    });

    expect(result.fileMatches).toEqual(["src/Needle.ts"]);
    expect(Array.from(result.contentMatches.entries())).toEqual([
      ["src/notes.txt", [{ line: 2, content: "A literal Needle appears here" }]],
    ]);
    expect(result.errors).toEqual([]);
    expect(fixture.get).not.toHaveBeenCalledWith(
      "project/node_modules",
      expect.anything()
    );
    expect(fixture.get).not.toHaveBeenCalledWith(
      "project/logo.png",
      expect.anything()
    );
  });

  it("uses literal matching and honours case-sensitive search", async () => {
    const fixture = createContentsFixture({
      project: directory([
        entry("Needle.txt", "project/Needle.txt", "file", 22),
        entry("literal.txt", "project/literal.txt", "file", 24),
      ]),
      "project/Needle.txt": textFile("Needle only"),
      "project/literal.txt": textFile("a.b[?] is plain text"),
    });
    const service = new WorkspaceSearchService(fixture.manager);

    const insensitive = await service.searchWorkspace({
      rootPath: "project",
      query: "needle",
      caseSensitive: false,
    });
    const sensitive = await service.searchWorkspace({
      rootPath: "project",
      query: "needle",
      caseSensitive: true,
    });
    const literal = await service.searchWorkspace({
      rootPath: "project",
      query: ".b[?]",
      caseSensitive: true,
    });

    expect(insensitive.fileMatches).toEqual(["Needle.txt"]);
    expect(Array.from(insensitive.contentMatches.keys())).toEqual(["Needle.txt"]);
    expect(sensitive.fileMatches).toEqual([]);
    expect(Array.from(sensitive.contentMatches.keys())).toEqual([]);
    expect(Array.from(literal.contentMatches.entries())).toEqual([
      ["literal.txt", [{ line: 1, content: "a.b[?] is plain text" }]],
    ]);
  });

  it("matches literal path fragments against workspace-relative file paths", async () => {
    const fixture = createContentsFixture({
      project: directory([entry("src", "project/src", "directory")]),
      "project/src": directory([entry("foo.ts", "project/src/foo.ts", "file", 10)]),
      "project/src/foo.ts": textFile("export {}"),
    });
    const service = new WorkspaceSearchService(fixture.manager);

    const result = await service.searchWorkspace({
      rootPath: "project",
      query: "src/foo",
      caseSensitive: true,
    });

    expect(result.fileMatches).toEqual(["src/foo.ts"]);
  });

  it("caps filename and content output at fifty results and trims previews", async () => {
    const entries: FixtureEntry[] = [];
    const models: Record<string, FixtureModel> = {};
    for (let index = 0; index < 51; index += 1) {
      const name = `needle-${String(index).padStart(2, "0")}.txt`;
      const path = `project/${name}`;
      const content = `needle ${"x".repeat(200)}`;
      entries.push(entry(name, path, "file", content.length));
      models[path] = textFile(content);
    }
    models.project = directory(entries);

    const service = new WorkspaceSearchService(
      createContentsFixture(models).manager
    );
    const result = await service.searchWorkspace({
      rootPath: "project",
      query: "needle",
      caseSensitive: true,
    });

    expect(result.fileMatches).toHaveLength(50);
    expect(result.fileMatchesTruncated).toBe(true);
    expect(result.contentMatchCount).toBe(50);
    expect(result.contentMatchesTruncated).toBe(true);
    expect(
      Array.from(result.contentMatches.values())[0]?.[0]?.content.length
    ).toBe(150);
  });

  it("marks per-file, total-text, and candidate scan safety limits as truncated", async () => {
    const largeContent = "x".repeat(WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES + 1);
    const perFileFixture = createContentsFixture({
      project: directory([
        entry(
          "large.txt",
          "project/large.txt",
          "file",
          WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES + 1
        ),
      ]),
      "project/large.txt": textFile(
        largeContent,
        WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES + 1
      ),
    });
    const perFileResult = await new WorkspaceSearchService(
      perFileFixture.manager
    ).searchWorkspace({
      rootPath: "project",
      query: "x",
      caseSensitive: true,
    });

    expect(perFileResult.contentMatchesTruncated).toBe(true);
    expect(perFileFixture.get).not.toHaveBeenCalledWith(
      "project/large.txt",
      expect.anything()
    );

    const totalEntries: FixtureEntry[] = [];
    const totalModels: Record<string, FixtureModel> = {};
    const oneMegabyte = "x".repeat(WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES);
    for (let index = 0; index < 11; index += 1) {
      const path = `project/text-${index}.txt`;
      totalEntries.push(
        entry(
          `text-${index}.txt`,
          path,
          "file",
          WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES
        )
      );
      totalModels[path] = textFile(
        oneMegabyte,
        WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES
      );
    }
    totalModels.project = directory(totalEntries);
    const totalResult = await new WorkspaceSearchService(
      createContentsFixture(totalModels).manager
    ).searchWorkspace({
      rootPath: "project",
      query: "needle",
      caseSensitive: true,
    });

    expect(totalResult.contentMatchCount).toBe(0);
    expect(totalResult.contentMatchesTruncated).toBe(true);

    const candidateEntries = Array.from(
      { length: WORKSPACE_SEARCH_MAX_CANDIDATE_FILES + 1 },
      (_, index) =>
        entry(
          `needle-${index}.png`,
          `project/needle-${index}.png`,
          "file",
          1
        )
    );
    const candidateResult = await new WorkspaceSearchService(
      createContentsFixture({ project: directory(candidateEntries) }).manager
    ).searchWorkspace({
      rootPath: "project",
      query: "needle",
      caseSensitive: true,
    });

    expect(candidateResult.fileMatches).toHaveLength(50);
    expect(candidateResult.fileMatchesTruncated).toBe(true);
    expect(candidateResult.contentMatchesTruncated).toBe(true);
    expect(WORKSPACE_SEARCH_MAX_TOTAL_TEXT_BYTES).toBe(10 * 1_024 * 1_024);
  });

  it("returns successful partial results with typed read failures", async () => {
    const fixture = createContentsFixture(
      {
        project: directory([
          entry("broken.txt", "project/broken.txt", "file", 10),
          entry("good.txt", "project/good.txt", "file", 10),
        ]),
        "project/good.txt": textFile("needle"),
      },
      new Set(["project/broken.txt"])
    );
    const service = new WorkspaceSearchService(fixture.manager);

    const result = await service.searchWorkspace({
      rootPath: "project",
      query: "needle",
      caseSensitive: true,
    });

    expect(Array.from(result.contentMatches.keys())).toEqual(["good.txt"]);
    expect(result.errors).toEqual([
      { path: "project/broken.txt", operation: "read-file" },
    ]);
  });

  it("caches listings and text reads until the affected path or service is cleared", async () => {
    const fixture = createContentsFixture({
      project: directory([entry("src", "project/src", "directory")]),
      "project/src": directory([
        entry("needle.txt", "project/src/needle.txt", "file", 6),
      ]),
      "project/src/needle.txt": textFile("needle"),
    });
    const service = new WorkspaceSearchService(fixture.manager);
    const request = {
      rootPath: "project",
      query: "needle",
      caseSensitive: true,
    };

    await service.searchWorkspace(request);
    await service.searchWorkspace(request);
    expect(requestCount(fixture.get, "project")).toBe(1);
    expect(requestCount(fixture.get, "project/src")).toBe(1);
    expect(requestCount(fixture.get, "project/src/needle.txt")).toBe(1);

    service.clearPath("project/src");
    await service.searchWorkspace(request);
    expect(requestCount(fixture.get, "project")).toBe(1);
    expect(requestCount(fixture.get, "project/src")).toBe(2);
    expect(requestCount(fixture.get, "project/src/needle.txt")).toBe(2);

    service.clear();
    await service.searchWorkspace(request);
    expect(requestCount(fixture.get, "project")).toBe(2);
    expect(requestCount(fixture.get, "project/src")).toBe(3);
    expect(requestCount(fixture.get, "project/src/needle.txt")).toBe(3);
  });
});
