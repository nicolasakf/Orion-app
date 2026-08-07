import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findRectCollision,
  findRectOverflow,
  inspectPlotlyOutput,
  isPlotAreaUndersized,
  type PlotlyInspectionRect,
} from "@/lib/notebook/plotly-output-inspection";
import { loadPlotly } from "@/lib/notebook/plotly-runtime";

vi.mock("@/lib/notebook/plotly-runtime", () => ({
  loadPlotly: vi.fn(),
}));

const container: PlotlyInspectionRect = { x: 0, y: 0, width: 800, height: 400 };

/** Installs a deterministic rectangle on one jsdom element. */
function setRect(element: Element, rect: PlotlyInspectionRect): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(rect.x, rect.y, rect.width, rect.height),
  );
}

/** Mounts the minimum live Plotly DOM required by the inspection tool. */
function mountPlotlyOutput(options?: { svg?: boolean; zeroSize?: boolean }): HTMLElement {
  document.body.innerHTML = `
    <div data-orion-cell-index="2" data-orion-output-count="1">
      <div id="output-2-0">
        <div class="orion-plotly-output">
          ${options?.svg === false ? "" : `
            <svg class="main-svg">
              <clipPath class="plotclip"><rect width="640" height="260"></rect></clipPath>
              <text class="gtitle"></text>
              <g class="legend"></g>
              <text class="xtitle"></text>
              <text class="ytitle"></text>
              <g class="annotation"></g>
            </svg>
          `}
        </div>
      </div>
    </div>`;
  const output = document.getElementById("output-2-0")!;
  const plot = output.querySelector(".orion-plotly-output")!;
  const size = options?.zeroSize ? { ...container, width: 0, height: 0 } : container;
  setRect(output, size);
  setRect(plot, size);
  const svg = plot.querySelector("svg");
  if (svg) setRect(svg, size);
  const title = plot.querySelector(".gtitle");
  if (title) setRect(title, { x: 20, y: 12, width: 180, height: 24 });
  const legend = plot.querySelector(".legend");
  if (legend) setRect(legend, { x: 560, y: 12, width: 200, height: 24 });
  const xTitle = plot.querySelector(".xtitle");
  if (xTitle) setRect(xTitle, { x: 350, y: 370, width: 100, height: 20 });
  const yTitle = plot.querySelector(".ytitle");
  if (yTitle) setRect(yTitle, { x: 8, y: 150, width: 20, height: 100 });
  const annotation = plot.querySelector(".annotation");
  if (annotation) setRect(annotation, { x: 250, y: 80, width: 120, height: 20 });
  return output;
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.mocked(loadPlotly).mockResolvedValue({
    toImage: vi.fn().mockResolvedValue("data:image/png;base64,cG5n"),
  } as never);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Plotly rectangle diagnostics", () => {
  it("ignores missing rectangles, touching edges, and overlap within tolerance", () => {
    expect(findRectCollision("a", null, "b", container)).toBeNull();
    expect(findRectCollision("a", { x: 0, y: 0, width: 10, height: 10 }, "b", { x: 10, y: 0, width: 10, height: 10 })).toBeNull();
    expect(findRectCollision("a", { x: 0, y: 0, width: 10, height: 10 }, "b", { x: 8, y: 0, width: 10, height: 10 })).toBeNull();
  });

  it("reports real collisions and overflow beyond tolerance", () => {
    expect(findRectCollision("title", { x: 0, y: 0, width: 20, height: 20 }, "legend", { x: 10, y: 5, width: 20, height: 20 })).toEqual({
      first: "title",
      second: "legend",
      width: 10,
      height: 15,
    });
    expect(findRectOverflow(container, { x: -4, y: 0, width: 810, height: 400 })).toEqual({
      top: 0,
      right: 6,
      bottom: 0,
      left: 4,
    });
  });

  it("detects undersized plot areas but accepts exactly half-size areas", () => {
    expect(isPlotAreaUndersized(container, null)).toBe(false);
    expect(isPlotAreaUndersized(container, { x: 0, y: 0, width: 400, height: 200 })).toBe(false);
    expect(isPlotAreaUndersized(container, { x: 0, y: 0, width: 399, height: 200 })).toBe(true);
  });
});

describe("inspectPlotlyOutput", () => {
  it("returns live diagnostics and a PNG visual", async () => {
    mountPlotlyOutput();
    const result = await inspectPlotlyOutput(2, 0);
    expect(result.text).toContain("Output: x=0, y=0, width=800, height=400");
    expect(result.text).toContain("Plot area: x=0, y=0, width=640, height=260");
    expect(result.text).toContain("Collisions: none detected");
    expect(result.visuals[0]).toMatchObject({
      data: "cG5n",
      source: "inspect_plotly_output",
      cellIndex: 2,
      outputIndex: 0,
    });
  });

  it("distinguishes invalid cells, invalid outputs, hidden outputs, and non-Plotly outputs", async () => {
    expect((await inspectPlotlyOutput(9, 0)).text).toContain("Cell 9 is invalid");
    document.body.innerHTML = '<div data-orion-cell-index="2" data-orion-output-count="1"></div>';
    expect((await inspectPlotlyOutput(2, 2)).text).toContain("Output 2 is invalid");
    expect((await inspectPlotlyOutput(2, 0)).text).toContain("hidden or not mounted");
    document.body.innerHTML = '<div data-orion-cell-index="2" data-orion-output-count="1"><div id="output-2-0"><pre>text</pre></div></div>';
    expect((await inspectPlotlyOutput(2, 0)).text).toContain("not a rendered Plotly JSON output");
  });

  it("distinguishes zero-size containers from render timeouts", async () => {
    vi.useFakeTimers();
    mountPlotlyOutput({ zeroSize: true });
    const zeroSizeResult = inspectPlotlyOutput(2, 0);
    await vi.advanceTimersByTimeAsync(3100);
    expect((await zeroSizeResult).text).toContain("zero-size container");

    mountPlotlyOutput({ svg: false });
    const timeoutResult = inspectPlotlyOutput(2, 0);
    await vi.advanceTimersByTimeAsync(3100);
    expect((await timeoutResult).text).toContain("render timed out");
  });

  it("returns diagnostics when Plotly image export fails", async () => {
    mountPlotlyOutput();
    vi.mocked(loadPlotly).mockResolvedValue({
      toImage: vi.fn().mockRejectedValue(new Error("export unavailable")),
    } as never);
    const result = await inspectPlotlyOutput(2, 0);
    expect(result.text).toContain("Image export failed: export unavailable");
    expect(result.visuals[0]?.visualInspectionUnavailableReason).toBe("export unavailable");
  });
});
