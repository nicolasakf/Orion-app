import { describe, expect, it, vi } from "vitest";

import {
  advanceMonacoCursorToNextLine,
  getMonacoRunExcerpt,
  isRunSelectedSourceShortcut,
} from "@/lib/notebook/monaco-selection";

describe("isRunSelectedSourceShortcut", () => {
  it("matches Option/Alt+Enter without other modifiers", () => {
    expect(
      isRunSelectedSourceShortcut({
        key: "Enter",
        altKey: true,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
  });

  it("does not match Cmd/Ctrl+Enter or Shift+Enter", () => {
    expect(
      isRunSelectedSourceShortcut({
        key: "Enter",
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      }),
    ).toBe(false);
    expect(
      isRunSelectedSourceShortcut({
        key: "Enter",
        altKey: true,
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
      }),
    ).toBe(false);
  });
});

describe("getMonacoRunExcerpt", () => {
  it("returns null when the editor or selection is missing", () => {
    expect(getMonacoRunExcerpt(null)).toBeNull();
    expect(
      getMonacoRunExcerpt({
        getModel: () => ({
          getValueInRange: () => "x = 1",
          getLineContent: () => "x = 1",
          getLineCount: () => 1,
          getLineMaxColumn: () => 6,
        }),
        getSelection: () => null,
        getPosition: () => ({ lineNumber: 1, column: 1 }),
        setPosition: () => {},
      }),
    ).toBeNull();
  });

  it("returns the selected text without advancing the caret", () => {
    expect(
      getMonacoRunExcerpt({
        getModel: () => ({
          getValueInRange: () => "print(1)",
          getLineContent: () => "print(1)",
          getLineCount: () => 1,
          getLineMaxColumn: () => 9,
        }),
        getSelection: () => ({ isEmpty: () => false }),
        getPosition: () => ({ lineNumber: 1, column: 1 }),
        setPosition: () => {},
      }),
    ).toEqual({ source: "print(1)", advanceCursor: false });
  });

  it("returns the current line when the caret is collapsed", () => {
    expect(
      getMonacoRunExcerpt({
        getModel: () => ({
          getValueInRange: () => "",
          getLineContent: (lineNumber: number) =>
            lineNumber === 2 ? "y = 2" : "x = 1",
          getLineCount: () => 2,
          getLineMaxColumn: () => 6,
        }),
        getSelection: () => ({ isEmpty: () => true }),
        getPosition: () => ({ lineNumber: 2, column: 3 }),
        setPosition: () => {},
      }),
    ).toEqual({ source: "y = 2", advanceCursor: true });
  });
});

describe("advanceMonacoCursorToNextLine", () => {
  it("moves the caret to the next line and clamps the column", () => {
    const setPosition = vi.fn();
    const reveal = vi.fn();
    advanceMonacoCursorToNextLine({
      getModel: () => ({
        getValueInRange: () => "",
        getLineContent: () => "ab",
        getLineCount: () => 3,
        getLineMaxColumn: (lineNumber: number) => (lineNumber === 2 ? 3 : 10),
      }),
      getSelection: () => ({ isEmpty: () => true }),
      getPosition: () => ({ lineNumber: 1, column: 8 }),
      setPosition,
      revealPositionInCenterIfOutsideViewport: reveal,
    });

    expect(setPosition).toHaveBeenCalledWith({ lineNumber: 2, column: 3 });
    expect(reveal).toHaveBeenCalledWith({ lineNumber: 2, column: 3 });
  });

  it("stays on the last line when already there", () => {
    const setPosition = vi.fn();
    advanceMonacoCursorToNextLine({
      getModel: () => ({
        getValueInRange: () => "",
        getLineContent: () => "end",
        getLineCount: () => 2,
        getLineMaxColumn: () => 4,
      }),
      getSelection: () => ({ isEmpty: () => true }),
      getPosition: () => ({ lineNumber: 2, column: 2 }),
      setPosition,
    });

    expect(setPosition).toHaveBeenCalledWith({ lineNumber: 2, column: 2 });
  });
});
