"use client";

import { z } from "zod";

export interface NativeProjectFolderSelection {
  path: string;
  name: string;
}

const NativeProjectFolderSelectionSchema = z.object({
  path: z.string(),
  name: z.string(),
});

const ProjectPickerErrorResponseSchema = z.object({
  message: z.string().trim().min(1).optional(),
});

/** Reads the clearest message from a local project-picker API failure. */
async function readProjectPickerErrorMessage(response: Response): Promise<string> {
  const fallback = "Failed to open the native project folder picker.";
  const json = await response.json().catch(() => null);
  const parsed = ProjectPickerErrorResponseSchema.safeParse(json);
  return parsed.success && parsed.data.message ? parsed.data.message : fallback;
}

/** Opens a native project picker through Electron, falling back to the local API route. */
export async function openNativeProjectFolderPicker(): Promise<NativeProjectFolderSelection | null> {
  try {
    const desktopSelection = await window.orionDesktopShell?.showProjectFolderPicker?.();
    if (desktopSelection) {
      return NativeProjectFolderSelectionSchema.parse(desktopSelection);
    }
    if (desktopSelection === null) return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/No handler registered/i.test(message)) {
      throw error;
    }
  }

  const response = await fetch("/api/local/projects/open-folder", {
    method: "POST",
  });
  if (response.status === 499) return null;
  if (!response.ok) {
    throw new Error(await readProjectPickerErrorMessage(response));
  }

  return NativeProjectFolderSelectionSchema.parse(await response.json());
}
