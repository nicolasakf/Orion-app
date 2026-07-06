import { describe, expect, it } from "vitest";

import {
  NOTEBOOK_EDITOR_STYLE_SCOPE,
  NOTEBOOK_RENDERED_STYLE_SCOPES,
  scopeCssToNotebook,
  scopeHtmlStyleTags,
} from "@/lib/notebook/scoped-html-styles";

describe("notebook HTML style scoping", () => {
  it("scopes broad notebook CSS to rendered content without touching inputs", () => {
    const scoped = scopeHtmlStyleTags(`
      <style>
        body, .jp-Notebook, .cm-editor,
        .jp-InputArea-editor, .jp-Cell-inputArea,
        h1, h2, p, div, span, pre, code {
          font-family: 'Times New Roman', Times, serif !important;
        }
      </style>
    `);

    expect(scoped).toContain('data-orion-style-scoped="notebook-editor"');
    expect(scoped).toContain(`${NOTEBOOK_RENDERED_STYLE_SCOPES[0]},`);
    expect(scoped).toContain(`${NOTEBOOK_RENDERED_STYLE_SCOPES[1]},`);
    expect(scoped).toContain(
      `${NOTEBOOK_RENDERED_STYLE_SCOPES[0]} h1`,
    );
    expect(scoped).toContain(`${NOTEBOOK_RENDERED_STYLE_SCOPES[1]} div`);
    expect(scoped).not.toContain("body, .jp-Notebook");
    expect(scoped).not.toContain(".cm-editor");
    expect(scoped).not.toContain(".jp-InputArea-editor");
    expect(scoped).not.toContain(".jp-Cell-inputArea");
    expect(scoped).not.toContain(`${NOTEBOOK_EDITOR_STYLE_SCOPE} div`);
  });

  it("scopes nested media rules but leaves keyframes intact", () => {
    const scoped = scopeCssToNotebook(`
      @media (min-width: 800px) {
        body, .jp-Cell { color: black; }
      }
      @keyframes fade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `);

    expect(scoped).toContain("@media (min-width: 800px)");
    expect(scoped).toContain(`${NOTEBOOK_RENDERED_STYLE_SCOPES[0]},`);
    expect(scoped).toContain(`${NOTEBOOK_RENDERED_STYLE_SCOPES[1]}`);
    expect(scoped).toContain("from { opacity: 0; }");
    expect(scoped).not.toContain(`${NOTEBOOK_RENDERED_STYLE_SCOPES[0]} from`);
  });

  it("does not split selector lists inside pseudo-class arguments", () => {
    const scoped = scopeCssToNotebook(
      ".custom:is(.selected, .active), a[href=','] { color: red; }",
    );

    expect(scoped).toContain(
      `${NOTEBOOK_RENDERED_STYLE_SCOPES[0]}.custom:is(.selected, .active), ${NOTEBOOK_RENDERED_STYLE_SCOPES[0]} .custom:is(.selected, .active)`,
    );
    expect(scoped).toContain(`${NOTEBOOK_RENDERED_STYLE_SCOPES[0]} a[href=',']`);
  });

  it("drops rules that only target notebook inputs", () => {
    const scoped = scopeCssToNotebook(
      ".cm-editor, .jp-InputArea-editor, .jp-Cell-inputArea span { font-family: serif; }",
    );

    expect(scoped.trim()).toBe("");
  });
});
