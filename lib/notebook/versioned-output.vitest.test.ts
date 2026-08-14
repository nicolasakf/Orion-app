import { describe, expect, it } from "vitest";

import {
  ORION_VERSIONED_OUTPUT_MIME_TYPE,
  getVersionedOutputPayload,
  mergeVersionedCellOutputs,
  parseVersionedOutputPayload,
} from "@/lib/notebook/versioned-output";
import { OutputType, type NotebookOutputType } from "@/lib/types";

function versionedOutput(
  id: string,
  text: string,
  options: { key?: string; maxVersions?: number } = {},
): NotebookOutputType {
  return {
    output_type: OutputType.DISPLAY_DATA,
    data: {
      "text/plain": [text],
      [ORION_VERSIONED_OUTPUT_MIME_TYPE]: {
        version: 1,
        ...(options.key ? { key: options.key } : {}),
        maxVersions: options.maxVersions ?? 10,
        current: {
          id,
          createdAt: `2026-08-14T12:00:0${id.slice(-1)}.000Z`,
          metadata: { source: id },
        },
        history: [],
      },
    },
    metadata: {},
  };
}

function plainOutput(text: string): NotebookOutputType {
  return {
    output_type: OutputType.DISPLAY_DATA,
    data: { "text/plain": [text] },
    metadata: {},
  };
}

describe("mergeVersionedCellOutputs", () => {
  it("promotes the previous current value into history", () => {
    const merged = mergeVersionedCellOutputs(
      [versionedOutput("v1", "first")],
      [versionedOutput("v2", "second")],
      true,
    );

    const payload = getVersionedOutputPayload(merged[0]!);
    expect(payload?.current.id).toBe("v2");
    expect(payload?.history).toEqual([
      {
        id: "v1",
        createdAt: "2026-08-14T12:00:01.000Z",
        metadata: { source: "v1" },
        data: { "text/plain": ["first"] },
      },
    ]);
  });

  it("matches keyed outputs after they are reordered", () => {
    const previous = [
      versionedOutput("a1", "A1", { key: "a" }),
      versionedOutput("b1", "B1", { key: "b" }),
    ];
    const next = [
      versionedOutput("b2", "B2", { key: "b" }),
      versionedOutput("a2", "A2", { key: "a" }),
    ];

    const merged = mergeVersionedCellOutputs(previous, next, true);

    expect(getVersionedOutputPayload(merged[0]!)?.history[0]?.id).toBe("b1");
    expect(getVersionedOutputPayload(merged[1]!)?.history[0]?.id).toBe("a1");
  });

  it("matches unkeyed outputs by versioned-output ordinal around normal output", () => {
    const previous = [
      plainOutput("log"),
      versionedOutput("first-1", "first old"),
      versionedOutput("second-1", "second old"),
    ];
    const next = [
      versionedOutput("first-2", "first new"),
      plainOutput("new log"),
      versionedOutput("second-2", "second new"),
    ];

    const merged = mergeVersionedCellOutputs(previous, next, true);

    expect(getVersionedOutputPayload(merged[0]!)?.history[0]?.id).toBe(
      "first-1",
    );
    expect(getVersionedOutputPayload(merged[2]!)?.history[0]?.id).toBe(
      "second-1",
    );
  });

  it("trims history to the new output's total retention limit", () => {
    const first = versionedOutput("v1", "one", { maxVersions: 2 });
    const second = mergeVersionedCellOutputs(
      [first],
      [versionedOutput("v2", "two", { maxVersions: 2 })],
      true,
    );
    const third = mergeVersionedCellOutputs(
      second,
      [versionedOutput("v3", "three", { maxVersions: 2 })],
      true,
    );

    expect(getVersionedOutputPayload(third[0]!)?.history.map(({ id }) => id)).toEqual([
      "v2",
    ]);
  });

  it("records repeated identical content as a new version", () => {
    const merged = mergeVersionedCellOutputs(
      [versionedOutput("v1", "same")],
      [versionedOutput("v2", "same")],
      true,
    );
    expect(getVersionedOutputPayload(merged[0]!)?.history).toHaveLength(1);
  });

  it("drops unmatched history after a successful execution", () => {
    expect(
      mergeVersionedCellOutputs(
        [versionedOutput("v1", "old")],
        [plainOutput("replacement")],
        true,
      ),
    ).toEqual([plainOutput("replacement")]);
  });

  it("restores unmatched history at its previous position after failure", () => {
    const previous = [plainOutput("before"), versionedOutput("v1", "old")];
    const error: NotebookOutputType = {
      output_type: OutputType.ERROR,
      ename: "ValueError",
      evalue: "bad",
      traceback: [],
    };

    const merged = mergeVersionedCellOutputs(previous, [error], false);

    expect(merged).toEqual([error, previous[1]]);
  });

  it("leaves malformed version markers untouched", () => {
    const malformed: NotebookOutputType = {
      output_type: OutputType.DISPLAY_DATA,
      data: {
        [ORION_VERSIONED_OUTPUT_MIME_TYPE]: { version: 1, history: [] },
      },
      metadata: {},
    };
    expect(mergeVersionedCellOutputs([], [malformed], true)).toEqual([
      malformed,
    ]);
    expect(
      parseVersionedOutputPayload(
        malformed.data?.[ORION_VERSIONED_OUTPUT_MIME_TYPE],
      ).status,
    ).toBe("invalid");
  });
});
