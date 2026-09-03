/**
 * Minimal Monaco editor surface needed to read or move the current caret.
 */
export interface MonacoExcerptEditor {
  getModel(): {
    getValueInRange(selection: unknown): string;
    getLineContent(lineNumber: number): string;
    getLineCount(): number;
    getLineMaxColumn(lineNumber: number): number;
  } | null;
  getSelection(): { isEmpty(): boolean } | null;
  getPosition(): { lineNumber: number; column: number } | null;
  setPosition(position: { lineNumber: number; column: number }): void;
  revealPositionInCenterIfOutsideViewport?(position: {
    lineNumber: number;
    column: number;
  }): void;
}

/** Source to execute from a code editor, plus whether the caret should advance. */
export interface RunExcerptPlan {
  source: string;
  advanceCursor: boolean;
}

/**
 * Returns true when Option/Alt+Enter should run the current editor excerpt.
 *
 * Cmd/Ctrl+Enter and Shift+Enter keep their existing run-cell bindings.
 */
export function isRunSelectedSourceShortcut(event: {
  key: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    event.key === "Enter" &&
    event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}

/**
 * Returns the selected text, or the current line when the caret is collapsed.
 */
export function getMonacoRunExcerpt(
  editor: MonacoExcerptEditor | null | undefined,
): RunExcerptPlan | null {
  if (!editor) return null;
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return null;

  if (!selection.isEmpty()) {
    const text = model.getValueInRange(selection);
    if (text.length === 0) return null;
    return { source: text, advanceCursor: false };
  }

  const position = editor.getPosition();
  if (!position) return null;
  return {
    source: model.getLineContent(position.lineNumber),
    advanceCursor: true,
  };
}

/**
 * Moves the caret down one line, clamping to the last line and its max column.
 */
export function advanceMonacoCursorToNextLine(
  editor: MonacoExcerptEditor | null | undefined,
): void {
  if (!editor) return;
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return;

  const nextLineNumber = Math.min(
    position.lineNumber + 1,
    model.getLineCount(),
  );
  const nextPosition = {
    lineNumber: nextLineNumber,
    column: Math.min(position.column, model.getLineMaxColumn(nextLineNumber)),
  };
  editor.setPosition(nextPosition);
  editor.revealPositionInCenterIfOutsideViewport?.(nextPosition);
}
