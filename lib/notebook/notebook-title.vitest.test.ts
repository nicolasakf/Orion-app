import { describe, expect, it } from "vitest";

import { prettifyNotebookStem, titleFromNotebookFilename } from "./notebook-title";

describe("prettifyNotebookStem", () => {
  it("converts snake_case stems", () => {
    expect(prettifyNotebookStem("notebook_title")).toBe("Notebook Title");
  });

  it("converts kebab-case stems", () => {
    expect(prettifyNotebookStem("notebook-title")).toBe("Notebook Title");
  });

  it("splits camelCase and PascalCase stems", () => {
    expect(prettifyNotebookStem("notebookTitle")).toBe("Notebook Title");
    expect(prettifyNotebookStem("NotebookTitle")).toBe("Notebook Title");
  });

  it("preserves common acronyms and version tags", () => {
    expect(prettifyNotebookStem("my_eda_analysis_v2")).toBe("My EDA Analysis V2");
    expect(prettifyNotebookStem("llm_api_demo")).toBe("LLM API Demo");
  });

  it("splits letter and number boundaries", () => {
    expect(prettifyNotebookStem("analysis2024")).toBe("Analysis 2024");
    expect(prettifyNotebookStem("model2eval")).toBe("Model 2 Eval");
  });

  it("collapses repeated separators", () => {
    expect(prettifyNotebookStem("foo__bar--baz")).toBe("Foo Bar Baz");
  });

  it("strips .agent suffix from sub-agent notebook stems", () => {
    expect(prettifyNotebookStem("data-profiler.agent")).toBe("Data Profiler");
  });

  it("keeps already readable multi-word stems", () => {
    expect(prettifyNotebookStem("Shared Notebook")).toBe("Shared Notebook");
  });
});

describe("titleFromNotebookFilename", () => {
  it("uses the basename and removes the .ipynb extension", () => {
    expect(titleFromNotebookFilename("projects/deep_learning.ipynb")).toBe(
      "Deep Learning",
    );
  });

  it("handles sub-agent notebook filenames", () => {
    expect(
      titleFromNotebookFilename(".agents/subagents/data-profiler.agent.ipynb"),
    ).toBe("Data Profiler");
  });

  it("falls back to Notebook for empty paths", () => {
    expect(titleFromNotebookFilename("")).toBe("Notebook");
  });
});
