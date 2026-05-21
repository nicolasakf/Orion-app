import { basename, extname } from "path";
import type { Monaco } from "@monaco-editor/react";

declare global {
  interface Window {
    monaco?: Monaco;
  }
}

/** Minimal Monaco surface used for extension → language lookup. */
type MonacoLanguageRegistry = {
  languages?: {
    getLanguages: () => Array<{ id: string; extensions?: string[] }>;
  };
};

/** Monaco language id used for dotenv-style files (KEY=VALUE, # comments). */
export const DOTENV_MONACO_LANGUAGE = "ini";

/**
 * Returns true for `.env`, `.env.local`, `.env.example`, and similar dotenv files.
 */
export function isDotenvFile(filepath: string): boolean {
  return /^\.env(?:\.|$)/.test(basename(filepath));
}

/**
 * Resolves a Monaco language id from a filepath.
 * Dotenv files are mapped explicitly; all other types use Monaco's registered extensions.
 */
export function getMonacoLanguageForFilepath(
  filepath: string,
  monaco?: MonacoLanguageRegistry,
): string {
  if (isDotenvFile(filepath)) {
    return DOTENV_MONACO_LANGUAGE;
  }

  const extension = extname(filepath).slice(1).toLowerCase();
  return getMonacoLanguageForExtension(extension, monaco);
}

/**
 * Looks up a Monaco language id by file extension using Monaco's language registry.
 */
export function getMonacoLanguageForExtension(
  extension: string,
  monaco?: MonacoLanguageRegistry,
): string {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, "");
  if (!normalizedExtension) {
    return "plaintext";
  }

  const monacoInstance =
    monaco ?? (typeof window !== "undefined" ? window.monaco : undefined);
  if (!monacoInstance?.languages) {
    return "plaintext";
  }

  const monacoExtension = `.${normalizedExtension}`;
  const foundLang = monacoInstance.languages
    .getLanguages()
    .find((lang) => lang.extensions?.includes(monacoExtension));

  return foundLang?.id ?? "plaintext";
}
