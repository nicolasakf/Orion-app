import type { ContentsManager } from "@jupyterlab/services";

import { DEFAULT_IGNORE_DIRS } from "@/lib/workspace/search-policies";

import type {
  GoalArtifactEntry,
  GoalArtifactManifest,
  GoalDeliverable,
} from "./types";

const MAX_MANIFEST_ENTRIES = 2_000;

/** Normalizes a Jupyter path while preventing parent traversal. */
export function normalizeGoalArtifactPath(value: string): string {
  const segments: string[] = [];
  for (const segment of value.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/** Converts the small path-glob contract used by goals into a safe matcher. */
export function matchesGoalDeliverable(path: string, pattern: string): boolean {
  const normalizedPath = normalizeGoalArtifactPath(path);
  const normalizedPattern = normalizeGoalArtifactPath(pattern);
  let expression = "^";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index]!;
    if (char === "*" && normalizedPattern[index + 1] === "*") {
      if (normalizedPattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
    } else if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else {
      expression += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  expression += "$";
  return new RegExp(expression).test(normalizedPath);
}

/** Builds a stable non-cryptographic fingerprint for manifest comparisons. */
export function fingerprintGoalEntries(entries: GoalArtifactEntry[]): string {
  const input = entries
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}\0${entry.kind}\0${entry.size ?? ""}\0${entry.lastModified ?? ""}`)
    .join("\n");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Diffs a current workspace scan against the baseline captured at goal activation. */
export function buildGoalArtifactManifest(options: {
  baselineEntries: GoalArtifactEntry[];
  currentEntries: GoalArtifactEntry[];
  deliverables: GoalDeliverable[];
  rootPath?: string;
  truncated?: boolean;
  capturedAt?: string;
}): GoalArtifactManifest {
  const rootPath = normalizeGoalArtifactPath(options.rootPath ?? "");
  const baseline = new Map(options.baselineEntries.map((entry) => [entry.path, entry]));
  const current = new Map(options.currentEntries.map((entry) => [entry.path, entry]));
  const createdPaths: string[] = [];
  const modifiedPaths: string[] = [];
  const deletedPaths: string[] = [];

  for (const entry of options.currentEntries) {
    const prior = baseline.get(entry.path);
    if (!prior) {
      createdPaths.push(entry.path);
      continue;
    }
    if (
      prior.kind !== entry.kind ||
      prior.size !== entry.size ||
      prior.lastModified !== entry.lastModified
    ) {
      modifiedPaths.push(entry.path);
    }
  }
  for (const entry of options.baselineEntries) {
    if (!current.has(entry.path)) deletedPaths.push(entry.path);
  }

  const deliverablePaths = options.currentEntries
    .filter((entry) => {
      const relativePath = rootPath && entry.path.startsWith(`${rootPath}/`)
        ? entry.path.slice(rootPath.length + 1)
        : entry.path;
      return options.deliverables.some((deliverable) =>
        matchesGoalDeliverable(relativePath, deliverable.path)
      );
    })
    .map((entry) => entry.path)
    .sort();

  const relevantPaths = new Set([
    ...createdPaths,
    ...modifiedPaths,
    ...deliverablePaths,
  ]);
  const relevantEntries = options.currentEntries.filter((entry) => relevantPaths.has(entry.path));
  return {
    entries: relevantEntries.sort((left, right) => left.path.localeCompare(right.path)),
    createdPaths: createdPaths.sort(),
    modifiedPaths: modifiedPaths.sort(),
    deletedPaths: deletedPaths.sort(),
    deliverablePaths,
    fingerprint: fingerprintGoalEntries([
      ...relevantEntries,
      ...deletedPaths.map((path) => ({
        path,
        kind: "file" as const,
        size: null,
        lastModified: "deleted",
      })),
    ]),
    truncated: options.truncated ?? false,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
  };
}

/** Recursively captures workspace file metadata through Jupyter Contents. */
export async function scanGoalWorkspace(options: {
  contents: ContentsManager;
  rootPath: string;
  ignoreDirectoryNames?: Iterable<string>;
  maxEntries?: number;
}): Promise<{ entries: GoalArtifactEntry[]; truncated: boolean }> {
  const rootPath = normalizeGoalArtifactPath(options.rootPath);
  const ignored = new Set(
    [...(options.ignoreDirectoryNames ?? DEFAULT_IGNORE_DIRS)].map((value) => value.toLowerCase())
  );
  const maxEntries = options.maxEntries ?? MAX_MANIFEST_ENTRIES;
  const pending = [rootPath];
  const entries: GoalArtifactEntry[] = [];
  let truncated = false;

  while (pending.length > 0) {
    const directoryPath = pending.shift()!;
    const directory = await options.contents.get(directoryPath, { content: true });
    if (directory.type !== "directory" || !Array.isArray(directory.content)) continue;

    for (const rawEntry of directory.content) {
      if (entries.length >= maxEntries) {
        truncated = true;
        break;
      }
      const entry = rawEntry as {
        name?: unknown;
        path?: unknown;
        type?: unknown;
        size?: unknown;
        last_modified?: unknown;
      };
      if (
        typeof entry.name !== "string" ||
        typeof entry.path !== "string" ||
        typeof entry.type !== "string"
      ) {
        continue;
      }
      if (entry.type === "directory") {
        if (!ignored.has(entry.name.toLowerCase())) pending.push(entry.path);
        continue;
      }
      if (entry.type !== "file" && entry.type !== "notebook") continue;
      entries.push({
        path: normalizeGoalArtifactPath(entry.path),
        kind: entry.type === "notebook" || entry.name.toLowerCase().endsWith(".ipynb")
          ? "notebook"
          : "file",
        size: typeof entry.size === "number" && Number.isFinite(entry.size) ? entry.size : null,
        lastModified: typeof entry.last_modified === "string" ? entry.last_modified : null,
      });
    }
    if (truncated) break;
  }

  return { entries, truncated };
}
