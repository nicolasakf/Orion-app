// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  DOTENV_MONACO_LANGUAGE,
  getMonacoLanguageForExtension,
  getMonacoLanguageForFilepath,
  isDotenvFile,
} from "@/lib/editor/monaco-language";

describe("monaco language resolution", () => {
  it("detects dotenv files by basename", () => {
    expect(isDotenvFile(".env")).toBe(true);
    expect(isDotenvFile(".env.local")).toBe(true);
    expect(isDotenvFile(".env.example")).toBe(true);
    expect(isDotenvFile("project/.env.development")).toBe(true);
    expect(isDotenvFile("config/environment")).toBe(false);
    expect(isDotenvFile(".environment")).toBe(false);
    expect(isDotenvFile("env")).toBe(false);
  });

  it("maps dotenv files to ini highlighting", () => {
    expect(getMonacoLanguageForFilepath(".env")).toBe(DOTENV_MONACO_LANGUAGE);
    expect(getMonacoLanguageForFilepath("apps/web/.env.production")).toBe(
      DOTENV_MONACO_LANGUAGE,
    );
  });

  it("uses Monaco's extension registry when available", () => {
    const monaco = {
      languages: {
        getLanguages: () => [
          { id: "markdown", extensions: [".md"] },
          { id: "yaml", extensions: [".yaml", ".yml"] },
        ],
      },
    };

    expect(getMonacoLanguageForFilepath("README.md", monaco)).toBe("markdown");
    expect(getMonacoLanguageForExtension("yaml", monaco)).toBe("yaml");
    expect(getMonacoLanguageForExtension("unknown", monaco)).toBe("plaintext");
  });

  it("falls back to plaintext when Monaco is unavailable", () => {
    expect(getMonacoLanguageForFilepath("README.md")).toBe("plaintext");
  });
});
