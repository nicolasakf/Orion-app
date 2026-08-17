/** Common notebook/analysis acronyms to preserve in uppercase when title-casing. */
const NOTEBOOK_TITLE_ACRONYMS = new Set([
  "ai",
  "api",
  "cpu",
  "csv",
  "eda",
  "gpu",
  "html",
  "http",
  "https",
  "id",
  "json",
  "llm",
  "ml",
  "nlp",
  "pdf",
  "sql",
  "ui",
  "url",
  "ux",
]);

/**
 * Splits a notebook filename stem into words, handling snake_case, kebab-case,
 * dot separators, camelCase, PascalCase, and letter/number boundaries.
 */
function splitNotebookStemIntoWords(stem: string): string[] {
  const withoutAgentSuffix = stem.replace(/\.agent$/i, "");
  const normalized = withoutAgentSuffix
    .replace(/[_.\-+]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])([0-9])/g, (match, letter: string) =>
      letter.toLowerCase() === "v" ? match : `${letter} ${match.slice(1)}`,
    )
    .replace(/([0-9])([a-zA-Z])/g, "$1 $2")
    .trim();

  if (!normalized) return [];

  return normalized.split(/\s+/).filter(Boolean);
}

/** Title-cases one notebook title word while preserving acronyms and version tags. */
function titleCaseNotebookWord(word: string): string {
  if (/^\d+$/.test(word)) return word;

  const lower = word.toLowerCase();
  if (NOTEBOOK_TITLE_ACRONYMS.has(lower)) return lower.toUpperCase();
  if (/^v\d+$/i.test(word)) return word.toUpperCase();

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Converts an ugly notebook filename stem into a readable title
 * (e.g. `my_eda_notebook-v2` → `My EDA Notebook V2`).
 */
export function prettifyNotebookStem(stem: string): string {
  const trimmed = stem.trim();
  if (!trimmed) return "Notebook";

  const words = splitNotebookStemIntoWords(trimmed);
  if (words.length === 0) return "Notebook";

  return words.map(titleCaseNotebookWord).join(" ");
}

/**
 * Derives a readable notebook title from a Jupyter-relative filepath.
 */
export function titleFromNotebookFilename(filepath: string): string {
  const basename = filepath.split(/[\\/]/).filter(Boolean).pop() ?? "notebook";
  const stem = basename.replace(/\.ipynb$/i, "").trim();
  return prettifyNotebookStem(stem || "notebook");
}
