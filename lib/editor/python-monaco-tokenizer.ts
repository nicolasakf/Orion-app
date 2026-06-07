import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";
import { language as pythonMonarchLanguage } from "monaco-editor/esm/vs/basic-languages/python/python.js";

const patchedMonacoInstances = new WeakSet<Monaco>();

/**
 * Builds a Python Monarch tokenizer with Monaco PR #5272's multiline f-string fix.
 *
 * Monaco 0.52.x sends `f'''` and `f"""` through the single-line f-string
 * states, which breaks syntax highlighting after multiline formatted strings.
 * This keeps the bundled tokenizer intact except for the string states touched
 * by https://github.com/microsoft/monaco-editor/pull/5272.
 *
 * TODO: Remove this local override and bump `monaco-editor` once PR #5272
 * lands upstream and is included in a Monaco release.
 */
export function createPythonLanguageWithMultilineFStringFix(): languages.IMonarchLanguage {
  return {
    ...pythonMonarchLanguage,
    tokenizer: {
      ...pythonMonarchLanguage.tokenizer,
      strings: [
        [/'$/, "string.escape", "@popall"],
        [/[fF][rR]?'''/, "string.escape", "@fTripleStringBody"],
        [/[rR][fF]'''/, "string.escape", "@fTripleStringBody"],
        [/[fF][rR]?'/, "string.escape", "@fStringBody"],
        [/[rR][fF]'/, "string.escape", "@fStringBody"],
        [/'/, "string.escape", "@stringBody"],
        [/"$/, "string.escape", "@popall"],
        [/[fF][rR]?"""/, "string.escape", "@fDblTripleStringBody"],
        [/[rR][fF]"""/, "string.escape", "@fDblTripleStringBody"],
        [/[fF][rR]?"/, "string.escape", "@fDblStringBody"],
        [/[rR][fF]"/, "string.escape", "@fDblStringBody"],
        [/"/, "string.escape", "@dblStringBody"],
      ],
      fTripleStringBody: [
        [/[^\\'{}]+/, "string"],
        [/\{[^}':!=]+/, "identifier", "@fStringDetail"],
        [/\\./, "string"],
        [/'''/, "string.escape", "@popall"],
        [/'/, "string"],
        [/\\$/, "string"],
      ],
      fDblTripleStringBody: [
        [/[^\\"{}]+/, "string"],
        [/\{[^}':!=]+/, "identifier", "@fStringDetail"],
        [/\\./, "string"],
        [/"""/, "string.escape", "@popall"],
        [/"/, "string"],
        [/\\$/, "string"],
      ],
    },
  };
}

/**
 * Registers the patched Python tokenizer once for each Monaco instance.
 */
export function registerPythonLanguageWithMultilineFStringFix(
  monaco: Monaco,
): void {
  if (patchedMonacoInstances.has(monaco)) {
    return;
  }

  monaco.languages.setMonarchTokensProvider(
    "python",
    createPythonLanguageWithMultilineFStringFix(),
  );
  patchedMonacoInstances.add(monaco);
}
