// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createPythonLanguageWithMultilineFStringFix } from "@/lib/editor/python-monaco-tokenizer";

function serializeStringRules(): Array<[string, string | undefined]> {
  const language = createPythonLanguageWithMultilineFStringFix();
  return language.tokenizer.strings.flatMap((rule) => {
    if (!Array.isArray(rule)) {
      return [];
    }

    const [pattern, , next] = rule as unknown[];
    if (!(pattern instanceof RegExp)) {
      return [];
    }

    return [[pattern.toString(), typeof next === "string" ? next : undefined]];
  });
}

describe("Python Monaco tokenizer", () => {
  it("routes triple-quoted f-strings to multiline states", () => {
    expect(serializeStringRules()).toEqual(
      expect.arrayContaining([
        ["/[fF][rR]?'''/", "@fTripleStringBody"],
        ["/[rR][fF]'''/", "@fTripleStringBody"],
        ['/[fF][rR]?"""/', "@fDblTripleStringBody"],
        ['/[rR][fF]"""/', "@fDblTripleStringBody"],
      ]),
    );
  });

  it("adds multiline f-string body states", () => {
    const language = createPythonLanguageWithMultilineFStringFix();

    expect(language.tokenizer.fTripleStringBody).toBeDefined();
    expect(language.tokenizer.fDblTripleStringBody).toBeDefined();
  });
});
