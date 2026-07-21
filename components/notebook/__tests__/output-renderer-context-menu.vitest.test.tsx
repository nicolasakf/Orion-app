import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutputRenderer } from "@/components/notebook/output-renderer";
import { OutputType } from "@/lib/types";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OutputRenderer context menu", () => {
  it.each([
    {
      name: "plain-text",
      data: { "text/plain": ["plain output"] },
      triggerText: "plain output",
    },
    {
      name: "HTML table",
      data: {
        "text/html": [
          "<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alice</td></tr></tbody></table>",
        ],
      },
      triggerText: "Alice",
    },
  ])("opens the shared menu for $name renderer output", async ({ data, triggerText }) => {
    const onToggleOutputAppView = vi.fn();

    render(
      <OutputRenderer
        output={{
          output_type: OutputType.DISPLAY_DATA,
          data,
          metadata: {},
        }}
        cellIndex={2}
        outputIndex={1}
        isInAppView
        onToggleOutputAppView={onToggleOutputAppView}
      />,
    );

    fireEvent.contextMenu(screen.getByText(triggerText));

    const removeItem = await screen.findByText("Remove from App View");
    fireEvent.click(removeItem);

    expect(onToggleOutputAppView).toHaveBeenCalledWith(2, 1);
  });

  it("hides the Presentation submenu in business mode", async () => {
    render(
      <OutputRenderer
        output={{
          output_type: OutputType.DISPLAY_DATA,
          data: {
            "text/html": ["<p>Rendered HTML</p>"],
            "text/plain": ["plain fallback"],
          },
          metadata: {},
        }}
        cellIndex={2}
        outputIndex={1}
        businessMode
        isInAppView
        onToggleOutputAppView={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Rendered HTML"));

    expect(await screen.findByText("Remove")).toBeInTheDocument();
    expect(screen.queryByText("Presentation")).not.toBeInTheDocument();
  });

  it("renders generic Plotly bootstrap HTML in the sandboxed Plotly frame", () => {
    render(
      <OutputRenderer
        output={{
          output_type: OutputType.DISPLAY_DATA,
          data: {
            "text/html": [
              '<div id="chart"></div><script>window.PlotlyConfig = {}; Plotly.newPlot("chart", [], {});</script>',
            ],
          },
          metadata: {},
        }}
      />,
    );

    const frame = screen.getByTitle("Plotly HTML output");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
  });

  it("silently suppresses loader-only Plotly HTML", () => {
    const { container } = render(
      <OutputRenderer
        output={{
          output_type: OutputType.DISPLAY_DATA,
          data: {
            "text/html": [
              '<script>window.PlotlyConfig = {}; /* plotly.js v2.35.2 */</script>',
            ],
          },
          metadata: {},
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Orion cannot render this output yet/)).not.toBeInTheDocument();
  });

  it("renders ordinary HTML links that point to Plotly", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <OutputRenderer
        output={{
          output_type: OutputType.DISPLAY_DATA,
          data: {
            "text/html": [
              '<p><a href="https://plotly.com/python/">Plotly guide</a></p>',
            ],
          },
          metadata: {},
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "Plotly guide" });
    fireEvent.click(link);

    expect(openSpy).toHaveBeenCalledWith(
      "https://plotly.com/python/",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
