import { z } from "zod";

import type { NotebookOutputType } from "@/lib/types";

export const ORION_VERSIONED_OUTPUT_MIME_TYPE =
  "application/vnd.orion.versioned-output+json";

const VersionSnapshotSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  data: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
});

const CurrentVersionSchema = VersionSnapshotSchema.omit({ data: true });

export const VersionedOutputPayloadSchema = z.object({
  version: z.literal(1),
  key: z.string().min(1).optional(),
  maxVersions: z.number().int().min(1),
  current: CurrentVersionSchema,
  history: z.array(VersionSnapshotSchema),
});

export type VersionedOutputSnapshot = z.infer<typeof VersionSnapshotSchema>;
export type VersionedOutputPayload = z.infer<
  typeof VersionedOutputPayloadSchema
>;

export type VersionedOutputParseResult =
  | { status: "valid"; payload: VersionedOutputPayload }
  | { status: "invalid"; errors: string[] };

/** Parses a versioned-output MIME value and returns readable validation errors. */
export function parseVersionedOutputPayload(
  value: unknown,
): VersionedOutputParseResult {
  const parsedValue =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return value;
          }
        })()
      : value;
  const parsed = VersionedOutputPayloadSchema.safeParse(parsedValue);
  if (parsed.success) {
    return { status: "valid", payload: parsed.data };
  }
  return {
    status: "invalid",
    errors: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`,
    ),
  };
}

/** Returns a valid versioned payload from a notebook output when present. */
export function getVersionedOutputPayload(
  output: NotebookOutputType,
): VersionedOutputPayload | null {
  const value = output.data?.[ORION_VERSIONED_OUTPUT_MIME_TYPE];
  if (value === undefined) return null;
  const parsed = parseVersionedOutputPayload(value);
  return parsed.status === "valid" ? parsed.payload : null;
}

/** Returns true when an output carries Orion's version-history MIME marker. */
export function isVersionedOutput(output: NotebookOutputType): boolean {
  return output.data?.[ORION_VERSIONED_OUTPUT_MIME_TYPE] !== undefined;
}

/** Removes the version-history marker while retaining the current rich MIME bundle. */
export function withoutVersionedOutputMime(
  data: NotebookOutputType["data"],
): Record<string, unknown> {
  const nextData = { ...(data ?? {}) } as Record<string, unknown>;
  delete nextData[ORION_VERSIONED_OUTPUT_MIME_TYPE];
  return nextData;
}

/** Returns current and historical snapshots in newest-first display order. */
export function getVersionedOutputSnapshots(
  output: NotebookOutputType,
  payload: VersionedOutputPayload,
): VersionedOutputSnapshot[] {
  return [
    {
      ...payload.current,
      data: withoutVersionedOutputMime(output.data),
    },
    ...payload.history,
  ];
}

interface PreviousVersionedOutput {
  index: number;
  output: NotebookOutputType;
  payload: VersionedOutputPayload;
}

/** Collects valid versioned outputs while retaining their original cell positions. */
function collectVersionedOutputs(
  outputs: readonly NotebookOutputType[],
): PreviousVersionedOutput[] {
  const collected: PreviousVersionedOutput[] = [];
  outputs.forEach((output, index) => {
    const payload = getVersionedOutputPayload(output);
    if (payload) collected.push({ index, output, payload });
  });
  return collected;
}

/**
 * Merges a completed execution with the version histories from the prior run.
 * Keyed outputs match by key; unkeyed outputs match by unkeyed-output ordinal.
 */
export function mergeVersionedCellOutputs(
  previousOutputs: readonly NotebookOutputType[],
  nextOutputs: readonly NotebookOutputType[],
  executionSucceeded: boolean,
): NotebookOutputType[] {
  const previous = collectVersionedOutputs(previousOutputs);
  const previousUnkeyed = previous.filter(({ payload }) => !payload.key);
  const consumed = new Set<number>();
  let nextUnkeyedOrdinal = 0;

  const merged = nextOutputs.map((output) => {
    const nextPayload = getVersionedOutputPayload(output);
    if (!nextPayload) return output;

    let match: PreviousVersionedOutput | undefined;
    if (nextPayload.key) {
      match = previous.find(
        (candidate) =>
          !consumed.has(candidate.index) &&
          candidate.payload.key === nextPayload.key,
      );
    } else {
      const candidate = previousUnkeyed[nextUnkeyedOrdinal];
      nextUnkeyedOrdinal += 1;
      if (candidate && !consumed.has(candidate.index)) match = candidate;
    }

    if (!match) return output;
    consumed.add(match.index);

    const previousCurrent: VersionedOutputSnapshot = {
      ...match.payload.current,
      data: withoutVersionedOutputMime(match.output.data),
    };
    const history = [previousCurrent, ...match.payload.history].slice(
      0,
      Math.max(0, nextPayload.maxVersions - 1),
    );
    return {
      ...output,
      data: {
        ...(output.data ?? {}),
        [ORION_VERSIONED_OUTPUT_MIME_TYPE]: {
          ...nextPayload,
          history,
        },
      },
    };
  });

  if (executionSucceeded) return merged;

  previous
    .filter(({ index }) => !consumed.has(index))
    .forEach(({ index, output }) => {
      merged.splice(Math.min(index, merged.length), 0, output);
    });
  return merged;
}
