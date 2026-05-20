import type { Root } from "mdast";
import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";

import {
  normalizeMarkdownMathSource,
  remarkMathJaxDelimiters,
} from "@/lib/markdown/math-delimiters";

/**
 * Parses markdown through Orion's math delimiter compatibility plugin.
 */
function parseMarkdown(source: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkMathJaxDelimiters);

  return processor.runSync(processor.parse(normalizeMarkdownMathSource(source)));
}

describe("remarkMathJaxDelimiters", () => {
  it("renders bare LaTeX environments as display math", () => {
    const tree = parseMarkdown(String.raw`
\begin{align}
\text{Purchase principal} &= \text{MSRP} - \text{purchase credit}
\end{align}
`.trim());

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({
      type: "math",
      value: expect.stringContaining(String.raw`\begin{align}`),
    });
  });

  it("supports MathJax inline and display delimiters", () => {
    const tree = parseMarkdown(String.raw`Inline \(E=mc^2\)

\[
\int_0^1 x^2 dx
\]`);

    expect(tree.children[0]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", value: "Inline " },
        { type: "inlineMath", value: "E=mc^2" },
      ],
    });
    expect(tree.children[1]).toMatchObject({
      type: "math",
      value: String.raw`\int_0^1 x^2 dx`,
    });
  });

  it("leaves code spans untouched", () => {
    const tree = parseMarkdown("Use \\(\\alpha\\), not `\\\\(\\alpha\\\\)`.");

    expect(tree.children[0]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", value: "Use " },
        { type: "inlineMath", value: String.raw`\alpha` },
        { type: "text", value: ", not " },
        { type: "inlineCode", value: String.raw`\\(\alpha\\)` },
        { type: "text", value: "." },
      ],
    });
  });

  it("does not wrap non-math LaTeX environments", () => {
    expect(
      normalizeMarkdownMathSource(String.raw`\begin{itemize}
\item A
\end{itemize}`),
    ).toBe(String.raw`\begin{itemize}
\item A
\end{itemize}`);
  });
});
