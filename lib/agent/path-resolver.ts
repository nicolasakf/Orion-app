export interface AgentPathContext {
  /** Absolute path to the Jupyter contents root on the Jupyter host. */
  rootDirectory?: string | null;
}

export interface ResolvedAgentPath {
  ok: true;
  /** The original path provided by the agent. */
  originalPath: string;
  /** Path relative to the Jupyter contents root, suitable for ContentsManager APIs. */
  jupyterPath: string;
  /** True when the agent supplied an absolute host path. */
  wasAbsolute: boolean;
}

export interface AgentPathError {
  ok: false;
  error: string;
}

export type AgentPathResolution = ResolvedAgentPath | AgentPathError;

interface ParsedPath {
  root: string;
  segments: string[];
  windows: boolean;
}

/** Returns true when a path is an absolute host path on POSIX or Windows. */
export function isAbsoluteAgentPath(pathValue: string): boolean {
  const trimmed = pathValue.trim();
  return (
    trimmed.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    /^[/\\]{2}[^/\\]+[/\\][^/\\]+/.test(trimmed)
  );
}

/** Converts an agent-facing path into a Jupyter-root-relative path. */
export function resolveAgentPath(
  pathValue: string,
  context: AgentPathContext
): AgentPathResolution {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return { ok: true, originalPath: pathValue, jupyterPath: "", wasAbsolute: false };
  }

  const wasAbsolute = isAbsoluteAgentPath(trimmed);
  if (!wasAbsolute) {
    const jupyterPath = normalizeJupyterRelativePath(trimmed);
    if (jupyterPath === ".." || jupyterPath.startsWith("../")) {
      return {
        ok: false,
        error:
          `[ERROR] Relative path '${trimmed}' leaves the Jupyter root. ` +
          "Use a path inside the Jupyter root.",
      };
    }
    return {
      ok: true,
      originalPath: pathValue,
      jupyterPath,
      wasAbsolute: false,
    };
  }

  const rootDirectory = context.rootDirectory?.trim();
  if (!rootDirectory) {
    return {
      ok: false,
      error:
        `[ERROR] Absolute path '${trimmed}' cannot be resolved because Orion does not know the Jupyter root directory for this connection. ` +
        "Use a Jupyter-root-relative path for this server.",
    };
  }

  const root = parseAbsolutePath(rootDirectory);
  const target = parseAbsolutePath(trimmed);
  if (!root || !target || root.windows !== target.windows) {
    return outsideRootError(trimmed, rootDirectory);
  }

  const sameRoot = root.windows
    ? root.root.toLowerCase() === target.root.toLowerCase()
    : root.root === target.root;
  if (!sameRoot) {
    return outsideRootError(trimmed, rootDirectory);
  }

  const rootSegments = root.windows
    ? root.segments.map((segment) => segment.toLowerCase())
    : root.segments;
  const targetSegments = target.windows
    ? target.segments.map((segment) => segment.toLowerCase())
    : target.segments;

  for (let index = 0; index < rootSegments.length; index += 1) {
    if (targetSegments[index] !== rootSegments[index]) {
      return outsideRootError(trimmed, rootDirectory);
    }
  }

  const relativeSegments = target.segments.slice(root.segments.length);
  return {
    ok: true,
    originalPath: pathValue,
    jupyterPath: relativeSegments.join("/"),
    wasAbsolute: true,
  };
}

/** Builds an absolute host path for prompt display from a Jupyter-relative path. */
export function toAgentAbsolutePath(
  jupyterPath: string | undefined | null,
  context: AgentPathContext
): string | null {
  const rootDirectory = context.rootDirectory?.trim();
  if (!rootDirectory) return null;

  const root = parseAbsolutePath(rootDirectory);
  if (!root) return null;

  const relative = normalizeJupyterRelativePath(jupyterPath ?? "");
  if (!relative) return normalizeAbsolutePath(rootDirectory);

  const separator = root.windows ? "\\" : "/";
  return `${normalizeAbsolutePath(rootDirectory)}${separator}${relative
    .split("/")
    .join(separator)}`;
}

/** Normalizes a Jupyter-relative path after its root-boundary check. */
function normalizeJupyterRelativePath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const segments: string[] = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function outsideRootError(pathValue: string, rootDirectory: string): AgentPathError {
  return {
    ok: false,
    error:
      `[ERROR] Path '${pathValue}' is outside the Jupyter root '${normalizeAbsolutePath(rootDirectory)}'. ` +
      "Orion can access files inside the Jupyter root only.",
  };
}

function normalizeAbsolutePath(pathValue: string): string {
  const parsed = parseAbsolutePath(pathValue);
  if (!parsed) return pathValue.trim();
  const separator = parsed.windows ? "\\" : "/";
  if (parsed.windows) {
    if (parsed.segments.length === 0) {
      return parsed.root.endsWith(":") ? `${parsed.root}${separator}` : parsed.root;
    }
    return `${parsed.root}${separator}${parsed.segments.join(separator)}`;
  }
  return `/${parsed.segments.join("/")}`.replace(/\/$/, "") || "/";
}

function parseAbsolutePath(pathValue: string): ParsedPath | null {
  const trimmed = pathValue.trim();
  const normalized = trimmed.replace(/\\/g, "/");

  const driveMatch = normalized.match(/^([A-Za-z]:)(?:\/|$)(.*)$/);
  if (driveMatch) {
    return {
      root: driveMatch[1],
      segments: normalizeSegments(driveMatch[2] ?? ""),
      windows: true,
    };
  }

  const uncMatch = normalized.match(/^\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
  if (uncMatch) {
    return {
      root: `//${uncMatch[1]}/${uncMatch[2]}`,
      segments: normalizeSegments(uncMatch[3] ?? ""),
      windows: true,
    };
  }

  if (normalized.startsWith("/")) {
    return {
      root: "/",
      segments: normalizeSegments(normalized.slice(1)),
      windows: false,
    };
  }

  return null;
}

function normalizeSegments(pathValue: string): string[] {
  const segments: string[] = [];
  for (const segment of pathValue.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0) segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments;
}
