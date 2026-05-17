"use client";

import * as React from "react";

export type NotebookViewMode = "notebook" | "app";

interface NotebookViewModeContextValue {
  notebookViewMode: NotebookViewMode;
  setNotebookViewMode: React.Dispatch<React.SetStateAction<NotebookViewMode>>;
}

const NotebookViewModeContext =
  React.createContext<NotebookViewModeContextValue | null>(null);

/**
 * Holds notebook vs app view mode so toggling does not re-render the entire
 * page shell (sidebars, resizable chrome). Only consumers update.
 */
export function NotebookViewModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notebookViewMode, setNotebookViewMode] =
    React.useState<NotebookViewMode>("notebook");

  const value = React.useMemo(
    () => ({
      notebookViewMode,
      setNotebookViewMode,
    }),
    [notebookViewMode],
  );

  return (
    <NotebookViewModeContext.Provider value={value}>
      {children}
    </NotebookViewModeContext.Provider>
  );
}

export function useNotebookViewMode(): NotebookViewModeContextValue {
  const ctx = React.useContext(NotebookViewModeContext);
  if (!ctx) {
    throw new Error(
      "useNotebookViewMode must be used within NotebookViewModeProvider",
    );
  }
  return ctx;
}
