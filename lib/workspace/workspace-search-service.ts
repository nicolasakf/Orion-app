import type { Contents, ContentsManager } from "@jupyterlab/services";

import {
  BINARY_EXTENSIONS,
  DEFAULT_IGNORE_DIRS,
} from "./search-policies";

/** Maximum number of files considered during one workspace search. */
export const WORKSPACE_SEARCH_MAX_CANDIDATE_FILES = 2_000;
/** Maximum number of file-name matches shown for one search. */
export const WORKSPACE_SEARCH_MAX_FILE_MATCHES = 50;
/** Maximum number of content matches shown for one search. */
export const WORKSPACE_SEARCH_MAX_CONTENT_MATCHES = 50;
/** Maximum number of characters retained for a matching line preview. */
export const WORKSPACE_SEARCH_MAX_LINE_PREVIEW_CHARS = 150;
/** Maximum size of one text file read by workspace search. */
export const WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES = 1_024 * 1_024;
/** Maximum aggregate text size inspected during one workspace search. */
export const WORKSPACE_SEARCH_MAX_TOTAL_TEXT_BYTES = 10 * 1_024 * 1_024;
/** Maximum simultaneous Jupyter Contents API requests started by a search. */
export const WORKSPACE_SEARCH_MAX_CONCURRENT_REQUESTS = 6;

/** Input for one literal workspace search. Paths are relative to the Jupyter root. */
export interface WorkspaceSearchRequest {
  rootPath: string;
  query: string;
  caseSensitive: boolean;
}

/** A single content match, with a one-based line number. */
export interface WorkspaceSearchContentMatch {
  line: number;
  content: string;
}

/** A non-fatal Contents API operation that could not be completed. */
export interface WorkspaceSearchError {
  path: string;
  operation: "list-directory" | "read-file";
}

/** Structured, shell-free workspace search output. All paths are workspace-relative. */
export interface WorkspaceSearchResult {
  fileMatches: readonly string[];
  contentMatches: ReadonlyMap<string, readonly WorkspaceSearchContentMatch[]>;
  contentMatchCount: number;
  fileMatchesTruncated: boolean;
  contentMatchesTruncated: boolean;
  errors: readonly WorkspaceSearchError[];
}

/** Optional policies used to keep sidebar search aligned with agent filesystem settings. */
export interface WorkspaceSearchServiceOptions {
  ignoreDirectoryNames?: Iterable<string>;
  binaryExtensions?: Iterable<string>;
}

interface DirectoryEntry {
  name: string;
  path: string;
  type: string;
  size?: number;
}

interface WorkspaceFileCandidate {
  path: string;
  relativePath: string;
  name: string;
  size?: number;
}

interface CachedTextFile {
  content: string;
  byteLength: number;
}

interface CandidateEnumeration {
  candidates: WorkspaceFileCandidate[];
  truncated: boolean;
}

type TextFileReadResult =
  | { kind: "text"; value: CachedTextFile }
  | { kind: "too-large" }
  | { kind: "not-text" };

/** Returns whether an unknown value is a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Normalizes a Jupyter Contents API path without allowing parent traversal. */
function normalizePath(path: string): string {
  const segments: string[] = [];

  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.join("/");
}

/** Joins two Jupyter Contents API paths. */
function joinPath(parentPath: string, childPath: string): string {
  return normalizePath(parentPath ? `${parentPath}/${childPath}` : childPath);
}

/** Returns true when `path` is `ancestorPath` or one of its descendants. */
function isPathWithin(path: string, ancestorPath: string): boolean {
  return (
    ancestorPath.length === 0 ||
    path === ancestorPath ||
    path.startsWith(`${ancestorPath}/`)
  );
}

/** Returns a path relative to `rootPath`, or null when it escapes that root. */
function toRelativePath(rootPath: string, path: string): string | null {
  if (!isPathWithin(path, rootPath)) return null;
  if (!rootPath) return path;
  return path === rootPath ? "" : path.slice(rootPath.length + 1);
}

/** Extracts a normalized file extension, including its leading dot. */
function getExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  return name.slice(lastDot).toLowerCase();
}

/** Calculates UTF-8 bytes without relying on server-side Node APIs. */
function getTextByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Builds a literal matcher, deliberately avoiding user-provided regular expressions. */
function createLiteralMatcher(
  query: string,
  caseSensitive: boolean
): (value: string) => boolean {
  const needle = caseSensitive ? query : query.toLowerCase();
  return (value) => (caseSensitive ? value : value.toLowerCase()).includes(needle);
}

/** Normalizes configured policy values into a lookup set. */
function toLookupSet(
  values: Iterable<string>,
  normalize: (value: string) => string
): ReadonlySet<string> {
  const normalized = new Set<string>();
  for (const value of values) {
    const next = normalize(value);
    if (next) normalized.add(next);
  }
  return normalized;
}

/** Narrows a Jupyter directory model entry into the data search needs. */
function toDirectoryEntry(value: unknown): DirectoryEntry | null {
  if (!isRecord(value)) return null;

  const name = value.name;
  const path = value.path;
  const type = value.type;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    typeof path !== "string" ||
    typeof type !== "string"
  ) {
    return null;
  }

  const size = value.size;
  return {
    name,
    path,
    type,
    ...(typeof size === "number" && Number.isFinite(size) && size >= 0
      ? { size }
      : {}),
  };
}

/** Extracts valid entries from a directory response. */
function getDirectoryEntries(model: Contents.IModel): readonly DirectoryEntry[] {
  if (model.type !== "directory" || !Array.isArray(model.content)) return [];

  const entries = model.content as unknown[];
  return entries
    .map(toDirectoryEntry)
    .filter((entry): entry is DirectoryEntry => entry !== null);
}

/** Resolves a directory entry path, accepting older servers that return a bare child path. */
function resolveEntryPath(directoryPath: string, entry: DirectoryEntry): string {
  const entryPath = normalizePath(entry.path);
  if (entryPath && isPathWithin(entryPath, directoryPath)) return entryPath;

  if (!entryPath || !entry.path.includes("/")) {
    return joinPath(directoryPath, entryPath || entry.name);
  }

  return entryPath;
}

/** Converts a file or notebook Contents response into searchable text when safe. */
function getSearchableText(model: Contents.IModel): string | null {
  if (model.format === "base64") return null;
  if (typeof model.content === "string") return model.content;

  if (
    model.content !== null &&
    model.content !== undefined &&
    (model.format === "json" || model.type === "notebook")
  ) {
    try {
      const serialized = JSON.stringify(model.content);
      return typeof serialized === "string" ? serialized : null;
    } catch {
      return null;
    }
  }

  return null;
}

/** Sorts candidate paths predictably before the bounded content scan begins. */
function sortByPath<T extends { relativePath: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

/** Returns a filename without its final extension for exact stem matching. */
function getFileStem(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

/** Returns the number of path segments in a normalized relative path. */
function getPathDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

interface FileMatchRelevance {
  tier: number;
  matchIndex: number;
}

/** Calculates the deterministic relevance tier for one literal file match. */
function getFileMatchRelevance(
  candidate: WorkspaceFileCandidate,
  query: string,
  caseSensitive: boolean
): FileMatchRelevance {
  const normalize = (value: string) =>
    caseSensitive ? value : value.toLowerCase();
  const needle = normalize(query);
  const name = normalize(candidate.name);
  const stem = normalize(getFileStem(candidate.name));
  const relativePath = normalize(candidate.relativePath);

  if (name === needle || stem === needle || relativePath === needle) {
    return { tier: 0, matchIndex: 0 };
  }
  if (name.startsWith(needle)) {
    return { tier: 1, matchIndex: 0 };
  }

  const nameMatchIndex = name.indexOf(needle);
  if (nameMatchIndex >= 0) {
    return { tier: 2, matchIndex: nameMatchIndex };
  }
  if (relativePath.startsWith(needle)) {
    return { tier: 3, matchIndex: 0 };
  }

  return {
    tier: 4,
    matchIndex: Math.max(0, relativePath.indexOf(needle)),
  };
}

/** Orders literal file matches by relevance with stable, predictable tie-breakers. */
function compareFileMatchRelevance(
  left: WorkspaceFileCandidate,
  right: WorkspaceFileCandidate,
  query: string,
  caseSensitive: boolean
): number {
  const leftRelevance = getFileMatchRelevance(left, query, caseSensitive);
  const rightRelevance = getFileMatchRelevance(right, query, caseSensitive);

  return (
    leftRelevance.tier - rightRelevance.tier ||
    leftRelevance.matchIndex - rightRelevance.matchIndex ||
    getPathDepth(left.relativePath) - getPathDepth(right.relativePath) ||
    left.relativePath.length - right.relativePath.length ||
    left.relativePath.localeCompare(right.relativePath)
  );
}

/** Orders content-result files using the relevance available within the bounded scan. */
function compareContentMatches(
  [leftPath, leftMatches]: [string, WorkspaceSearchContentMatch[]],
  [rightPath, rightMatches]: [string, WorkspaceSearchContentMatch[]]
): number {
  return (
    rightMatches.length - leftMatches.length ||
    (leftMatches[0]?.line ?? Number.MAX_SAFE_INTEGER) -
      (rightMatches[0]?.line ?? Number.MAX_SAFE_INTEGER) ||
    getPathDepth(leftPath) - getPathDepth(rightPath) ||
    leftPath.length - rightPath.length ||
    leftPath.localeCompare(rightPath)
  );
}

/**
 * Searches a mounted Jupyter workspace exclusively through ContentsManager.
 * Listings and eligible text files are cached until callers clear the relevant
 * path, workspace, or kernel instance.
 */
export class WorkspaceSearchService {
  private readonly ignoreDirectoryNames: ReadonlySet<string>;
  private readonly binaryExtensions: ReadonlySet<string>;
  private readonly directoryCache = new Map<string, readonly DirectoryEntry[]>();
  private readonly directoryRequests = new Map<
    string,
    Promise<readonly DirectoryEntry[]>
  >();
  private readonly textCache = new Map<string, CachedTextFile>();
  private readonly textRequests = new Map<string, Promise<TextFileReadResult>>();
  private textCacheBytes = 0;
  private cacheEpoch = 0;

  /** Creates a ContentsManager-backed search service for one mounted workspace. */
  constructor(
    private readonly contentsManager: ContentsManager,
    options: WorkspaceSearchServiceOptions = {}
  ) {
    this.ignoreDirectoryNames = toLookupSet(
      options.ignoreDirectoryNames ?? DEFAULT_IGNORE_DIRS,
      (value) => value.trim()
    );
    this.binaryExtensions = toLookupSet(
      options.binaryExtensions ?? BINARY_EXTENSIONS,
      (value) => value.trim().toLowerCase()
    );
  }

  /** Clears every cached listing and text read for this workspace search instance. */
  clear(): void {
    this.cacheEpoch += 1;
    this.directoryCache.clear();
    this.directoryRequests.clear();
    this.textCache.clear();
    this.textRequests.clear();
    this.textCacheBytes = 0;
  }

  /** Clears cached data for a changed folder and every descendant beneath it. */
  clearPath(path: string): void {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) {
      this.clear();
      return;
    }

    this.cacheEpoch += 1;
    this.clearMatchingKeys(this.directoryCache, normalizedPath);
    this.clearMatchingKeys(this.directoryRequests, normalizedPath);
    this.clearMatchingTextCache(normalizedPath);
    this.clearMatchingKeys(this.textRequests, normalizedPath);
  }

  /** Runs one literal file-name and file-content search under the supplied root. */
  async searchWorkspace(
    request: WorkspaceSearchRequest
  ): Promise<WorkspaceSearchResult> {
    if (!request.query) {
      return {
        fileMatches: [],
        contentMatches: new Map(),
        contentMatchCount: 0,
        fileMatchesTruncated: false,
        contentMatchesTruncated: false,
        errors: [],
      };
    }

    const rootPath = normalizePath(request.rootPath);
    const matcher = createLiteralMatcher(request.query, request.caseSensitive);
    const errors: WorkspaceSearchError[] = [];
    const enumeration = await this.enumerateCandidates(rootPath, errors);
    const candidates = sortByPath(enumeration.candidates);

    const rankedFileCandidates = candidates
      .filter(
        (candidate) =>
          matcher(candidate.name) || matcher(candidate.relativePath)
      )
      .sort((left, right) =>
        compareFileMatchRelevance(
          left,
          right,
          request.query,
          request.caseSensitive
        )
      );
    const fileMatches = rankedFileCandidates
      .slice(0, WORKSPACE_SEARCH_MAX_FILE_MATCHES)
      .map((candidate) => candidate.relativePath);
    const fileMatchesTruncated =
      enumeration.truncated ||
      rankedFileCandidates.length > WORKSPACE_SEARCH_MAX_FILE_MATCHES;

    const contentSearch = await this.searchFileContents(candidates, matcher, {
      truncated: enumeration.truncated,
      errors,
    });

    return {
      fileMatches,
      contentMatches: contentSearch.matches,
      contentMatchCount: contentSearch.count,
      fileMatchesTruncated,
      contentMatchesTruncated: contentSearch.truncated,
      errors: errors.sort((left, right) => {
        const pathComparison = left.path.localeCompare(right.path);
        return pathComparison || left.operation.localeCompare(right.operation);
      }),
    };
  }

  /** Recursively lists file candidates while enforcing the browser scan budget. */
  private async enumerateCandidates(
    rootPath: string,
    errors: WorkspaceSearchError[]
  ): Promise<CandidateEnumeration> {
    const candidates: WorkspaceFileCandidate[] = [];
    const visitedDirectories = new Set<string>([rootPath]);
    const pendingDirectories = [rootPath];
    let truncated = false;

    while (pendingDirectories.length > 0 && !truncated) {
      const batch = pendingDirectories.splice(
        0,
        WORKSPACE_SEARCH_MAX_CONCURRENT_REQUESTS
      );
      const listings = await Promise.all(
        batch.map(async (directoryPath) => {
          try {
            return {
              directoryPath,
              entries: await this.getCachedDirectoryEntries(directoryPath),
            } as const;
          } catch {
            return { directoryPath, entries: null } as const;
          }
        })
      );

      for (const listing of listings) {
        if (listing.entries === null) {
          errors.push({
            path: listing.directoryPath,
            operation: "list-directory",
          });
          continue;
        }

        const entries = [...listing.entries].sort((left, right) =>
          left.name.localeCompare(right.name)
        );
        for (const entry of entries) {
          if (this.ignoreDirectoryNames.has(entry.name)) continue;

          const path = resolveEntryPath(listing.directoryPath, entry);
          const relativePath = toRelativePath(rootPath, path);
          if (relativePath === null) continue;

          if (entry.type === "directory") {
            if (!visitedDirectories.has(path)) {
              visitedDirectories.add(path);
              pendingDirectories.push(path);
            }
            continue;
          }

          candidates.push({
            path,
            relativePath,
            name: entry.name,
            ...(entry.size !== undefined ? { size: entry.size } : {}),
          });

          if (candidates.length >= WORKSPACE_SEARCH_MAX_CANDIDATE_FILES) {
            truncated = true;
            break;
          }
        }

        if (truncated) break;
      }
    }

    return { candidates, truncated };
  }

  /** Searches eligible files with a bounded Contents API request pool. */
  private async searchFileContents(
    candidates: readonly WorkspaceFileCandidate[],
    matcher: (value: string) => boolean,
    state: { truncated: boolean; errors: WorkspaceSearchError[] }
  ): Promise<{
    matches: ReadonlyMap<string, readonly WorkspaceSearchContentMatch[]>;
    count: number;
    truncated: boolean;
  }> {
    const matchesByPath = new Map<string, WorkspaceSearchContentMatch[]>();
    let totalTextBytes = 0;
    let matchCount = 0;
    let truncated = state.truncated;
    let stopped = false;

    for (
      let batchStart = 0;
      batchStart < candidates.length && !stopped;
      batchStart += WORKSPACE_SEARCH_MAX_CONCURRENT_REQUESTS
    ) {
      const batch = candidates.slice(
        batchStart,
        batchStart + WORKSPACE_SEARCH_MAX_CONCURRENT_REQUESTS
      );
      const reads = await Promise.all(
        batch.map(async (candidate) => {
          if (this.binaryExtensions.has(getExtension(candidate.name))) {
            return { candidate, outcome: "skip" as const };
          }
          if (
            candidate.size !== undefined &&
            candidate.size > WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES
          ) {
            return { candidate, outcome: "too-large" as const };
          }
          try {
            return {
              candidate,
              outcome: "read" as const,
              result: await this.getCachedTextFile(candidate.path),
            };
          } catch {
            return { candidate, outcome: "error" as const };
          }
        })
      );

      // Promise.all preserves candidate order, so shared budgets are deterministic
      // even when individual Contents API reads finish in a different order.
      for (const read of reads) {
        const { candidate } = read;
        if (read.outcome === "skip") continue;
        if (read.outcome === "error") {
          state.errors.push({ path: candidate.path, operation: "read-file" });
          continue;
        }
        if (read.outcome === "too-large" || read.result.kind === "too-large") {
          truncated = true;
          continue;
        }
        if (read.result.kind === "not-text") continue;

        if (
          totalTextBytes + read.result.value.byteLength >
          WORKSPACE_SEARCH_MAX_TOTAL_TEXT_BYTES
        ) {
          truncated = true;
          stopped = true;
          break;
        }

        totalTextBytes += read.result.value.byteLength;
        const fileMatches: WorkspaceSearchContentMatch[] = [];
        const lines = read.result.value.content.split(/\r?\n/);

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          const line = lines[lineIndex] ?? "";
          if (!matcher(line)) continue;
          if (matchCount >= WORKSPACE_SEARCH_MAX_CONTENT_MATCHES) {
            truncated = true;
            stopped = true;
            break;
          }

          fileMatches.push({
            line: lineIndex + 1,
            content: line.slice(0, WORKSPACE_SEARCH_MAX_LINE_PREVIEW_CHARS),
          });
          matchCount += 1;
        }

        if (fileMatches.length > 0) {
          matchesByPath.set(candidate.relativePath, fileMatches);
        }
        if (stopped) break;
      }
    }

    return {
      matches: new Map(
        Array.from(matchesByPath.entries()).sort(compareContentMatches)
      ),
      count: matchCount,
      truncated,
    };
  }

  /** Reads and caches a directory listing unless another request is already in flight. */
  private getCachedDirectoryEntries(
    path: string
  ): Promise<readonly DirectoryEntry[]> {
    const cached = this.directoryCache.get(path);
    if (cached) return Promise.resolve(cached);

    const inFlight = this.directoryRequests.get(path);
    if (inFlight) return inFlight;

    const requestEpoch = this.cacheEpoch;
    // `request` is referenced by its own `finally` callback, which runs in a
    // later microtask — the binding is always initialized by then.
    const request: Promise<readonly DirectoryEntry[]> = this.contentsManager
      .get(path, { content: true })
      .then((model) => {
        const entries = getDirectoryEntries(model);
        if (requestEpoch === this.cacheEpoch) {
          this.directoryCache.set(path, entries);
        }
        return entries;
      })
      .finally(() => {
        if (this.directoryRequests.get(path) === request) {
          this.directoryRequests.delete(path);
        }
      });
    this.directoryRequests.set(path, request);
    return request;
  }

  /** Reads, bounds, and caches a text file unless another request is already in flight. */
  private getCachedTextFile(path: string): Promise<TextFileReadResult> {
    const cached = this.textCache.get(path);
    if (cached) {
      this.textCache.delete(path);
      this.textCache.set(path, cached);
      return Promise.resolve({ kind: "text", value: cached });
    }

    const inFlight = this.textRequests.get(path);
    if (inFlight) return inFlight;

    const requestEpoch = this.cacheEpoch;
    // Same self-referencing `finally` pattern as readDirectory above.
    const request: Promise<TextFileReadResult> = this.contentsManager
      .get(path, { content: true })
      .then((model): TextFileReadResult => {
        if (
          model.size !== undefined &&
          model.size > WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES
        ) {
          return { kind: "too-large" };
        }

        const content = getSearchableText(model);
        if (content === null) return { kind: "not-text" };

        const value = {
          content,
          byteLength: getTextByteLength(content),
        };
        if (value.byteLength > WORKSPACE_SEARCH_MAX_TEXT_FILE_BYTES) {
          return { kind: "too-large" };
        }

        if (requestEpoch === this.cacheEpoch) {
          this.cacheTextFile(path, value);
        }
        return { kind: "text", value };
      })
      .finally(() => {
        if (this.textRequests.get(path) === request) {
          this.textRequests.delete(path);
        }
      });
    this.textRequests.set(path, request);
    return request;
  }

  /** Stores text in an LRU cache bounded by the same total-text safety budget. */
  private cacheTextFile(path: string, value: CachedTextFile): void {
    const existing = this.textCache.get(path);
    if (existing) {
      this.textCacheBytes -= existing.byteLength;
      this.textCache.delete(path);
    }

    while (
      this.textCacheBytes + value.byteLength >
        WORKSPACE_SEARCH_MAX_TOTAL_TEXT_BYTES &&
      this.textCache.size > 0
    ) {
      const oldestPath = this.textCache.keys().next().value;
      if (typeof oldestPath !== "string") break;
      const oldest = this.textCache.get(oldestPath);
      if (oldest) this.textCacheBytes -= oldest.byteLength;
      this.textCache.delete(oldestPath);
    }

    this.textCache.set(path, value);
    this.textCacheBytes += value.byteLength;
  }

  /** Deletes cached map entries that are rooted under a changed path. */
  private clearMatchingKeys<T>(cache: Map<string, T>, path: string): void {
    for (const key of cache.keys()) {
      if (isPathWithin(key, path)) cache.delete(key);
    }
  }

  /** Deletes cached text entries and keeps the aggregate byte count accurate. */
  private clearMatchingTextCache(path: string): void {
    for (const [key, value] of this.textCache) {
      if (!isPathWithin(key, path)) continue;
      this.textCacheBytes -= value.byteLength;
      this.textCache.delete(key);
    }
  }
}
