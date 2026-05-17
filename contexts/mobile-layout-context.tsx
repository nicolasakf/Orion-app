"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback } from "react";

export type MobileView = "chat" | "left-sidebar" | "editor" | "terminal";

interface MobileLayoutContextValue {
  /** Currently active full-screen mobile view */
  activeMobileView: MobileView;
  /** Switch to a different mobile view */
  setActiveMobileView: (view: MobileView) => void;
}

const MobileLayoutContext = createContext<MobileLayoutContextValue | null>(null);

/**
 * Provides mobile layout state (active full-screen panel view)
 * for the mobile responsive layout. Defaults to showing the chat view.
 */
export function MobileLayoutProvider({ children }: { children: React.ReactNode }) {
  const [activeMobileView, setActiveMobileView] = useState<MobileView>("chat");

  const handleSetView = useCallback((view: MobileView) => {
    setActiveMobileView(view);
  }, []);

  return (
    <MobileLayoutContext.Provider
      value={{
        activeMobileView,
        setActiveMobileView: handleSetView,
      }}
    >
      {children}
    </MobileLayoutContext.Provider>
  );
}

/**
 * Access the mobile layout state. Must be used within MobileLayoutProvider.
 */
export function useMobileLayout(): MobileLayoutContextValue {
  const context = useContext(MobileLayoutContext);
  if (!context) {
    throw new Error("useMobileLayout must be used within a MobileLayoutProvider");
  }
  return context;
}
