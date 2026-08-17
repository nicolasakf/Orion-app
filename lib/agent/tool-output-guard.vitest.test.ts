import { describe, expect, it } from "vitest";

import { guardToolText, stripAnsiEscapes } from "./tool-output-guard";

/**
 * Verbatim opening of the IPython traceback that session 1786825713795 carried
 * into every subsequent prompt, with the escape bytes written as `\u001B`.
 */
const COLOURED_TRACEBACK =
  "[ERROR: EmptyDataError: No columns to parse from file]\n" +
  "\u001B[31m---------------------------------------------------------------------------\u001B[39m\n" +
  "\u001B[31mEmptyDataError\u001B[39m                            Traceback (most recent call last)\n" +
  "\u001B[36mCell\u001B[39m\u001B[36m \u001B[39m\u001B[32mIn[6]\u001B[39m\u001B[32m, line 5\u001B[39m\n" +
  "\u001B[32m      3\u001B[39m \u001B[38;5;28;01mfor\u001B[39;00m gid \u001B[38;5;129;01min\u001B[39;00m group_ids:\n" +
  "\u001B[32m----> \u001B[39m\u001B[32m5\u001B[39m     df_g = \u001B[43mpd\u001B[49m.read_csv(fp)\n";

describe("stripAnsiEscapes", () => {
  it("removes colour codes while keeping the traceback readable", () => {
    const stripped = stripAnsiEscapes(COLOURED_TRACEBACK);

    expect(stripped).not.toContain("\u001B");
    expect(stripped).toContain("EmptyDataError");
    expect(stripped).toContain("Traceback (most recent call last)");
    expect(stripped).toContain("In[6]");
    expect(stripped).toContain("df_g = pd.read_csv(fp)");
    expect(stripped).toContain("for gid in group_ids:");
  });

  it("meaningfully shrinks a coloured traceback", () => {
    const stripped = stripAnsiEscapes(COLOURED_TRACEBACK);

    // A third of these opening frames is paint; the deeper pandas frames in the
    // real traceback are denser still.
    expect(stripped.length).toBeLessThan(COLOURED_TRACEBACK.length * 0.7);
  });

  it("strips OSC sequences terminated by BEL", () => {
    expect(stripAnsiEscapes("before\u001B]0;window title\u0007after")).toBe("beforeafter");
  });

  it("returns escape-free text untouched", () => {
    const plain = "Cell 3 ran\nno colour here";
    expect(stripAnsiEscapes(plain)).toBe(plain);
  });
});

describe("guardToolText", () => {
  it("strips escapes before measuring the budget", () => {
    const guarded = guardToolText(COLOURED_TRACEBACK);

    expect(guarded.mode).toBe("unchanged");
    expect(guarded.text).not.toContain("\u001B");
    // The reported size is the content the model actually receives.
    expect(guarded.originalChars).toBeLessThan(COLOURED_TRACEBACK.length);
    expect(guarded.originalChars).toBe(guarded.text.length);
  });

  it("spends the truncation budget on content rather than colour codes", () => {
    const noisy = "\u001B[31mx\u001B[39m".repeat(2_000);
    const maxChars = 1_800;

    const guarded = guardToolText(noisy, { maxChars });

    // Raw, this is 18,000 chars — 90% over budget, which trips the "too large"
    // branch and discards the content entirely. Stripped it is 2,000 visible
    // chars, so the model still gets a usable preview.
    expect(guarded.mode).toBe("truncated");
    expect(guarded.text).not.toContain("\u001B");
  });
});
