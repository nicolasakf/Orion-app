"use client";

import { useEffect } from "react";

import { useOpenSettings } from "@/contexts/open-settings-context";
import { PERSONAL_CONTEXT_EDITOR_PATH } from "@/lib/onboarding/personal-context-editor-path";

interface OpenPersonalContextFileReference {
  name: string;
  path: string;
}

interface UseRegisterOpenPersonalContextFileOptions {
  onOpenFile: (file: OpenPersonalContextFileReference) => void;
}

/**
 * Registers the handler that opens `ORION.md` in the main editor.
 */
export function useRegisterOpenPersonalContextFile({
  onOpenFile,
}: UseRegisterOpenPersonalContextFileOptions): void {
  const { registerOpenPersonalContextFileHandler } = useOpenSettings();

  useEffect(() => {
    registerOpenPersonalContextFileHandler(() => {
      onOpenFile({
        name: "ORION.md",
        path: PERSONAL_CONTEXT_EDITOR_PATH,
      });
      window.dispatchEvent(new CustomEvent("orion:focusEditor"));
    });

    return () => {
      registerOpenPersonalContextFileHandler(null);
    };
  }, [onOpenFile, registerOpenPersonalContextFileHandler]);
}
