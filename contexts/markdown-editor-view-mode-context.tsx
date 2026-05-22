"use client";

import * as React from "react";

export type MarkdownEditorViewMode = "edit" | "preview";

interface MarkdownEditorViewModeContextValue {
  markdownEditorViewMode: MarkdownEditorViewMode;
  setMarkdownEditorViewMode: React.Dispatch<
    React.SetStateAction<MarkdownEditorViewMode>
  >;
}

const MarkdownEditorViewModeContext =
  React.createContext<MarkdownEditorViewModeContextValue | null>(null);

/**
 * Holds Markdown edit/preview mode so the page toolbar and editor body can
 * coordinate without lifting mode state into the full page shell.
 */
export function MarkdownEditorViewModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [markdownEditorViewMode, setMarkdownEditorViewMode] =
    React.useState<MarkdownEditorViewMode>("edit");

  const value = React.useMemo(
    () => ({
      markdownEditorViewMode,
      setMarkdownEditorViewMode,
    }),
    [markdownEditorViewMode],
  );

  return (
    <MarkdownEditorViewModeContext.Provider value={value}>
      {children}
    </MarkdownEditorViewModeContext.Provider>
  );
}

export function useMarkdownEditorViewMode(): MarkdownEditorViewModeContextValue {
  const ctx = React.useContext(MarkdownEditorViewModeContext);
  if (!ctx) {
    throw new Error(
      "useMarkdownEditorViewMode must be used within MarkdownEditorViewModeProvider",
    );
  }
  return ctx;
}
