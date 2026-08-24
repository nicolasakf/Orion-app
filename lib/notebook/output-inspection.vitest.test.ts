import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findRectCollision,
  findRectOverflow,
  getOutputInspectionScale,
  inspectOutput,
  isPlotAreaUndersized,
  type OutputInspectionRect,
} from "@/lib/notebook/output-inspection";
import html2canvas from "html2canvas";

vi.mock("html2canvas", () => ({ default: vi.fn() }));

const container: OutputInspectionRect = { x: 0, y: 0, width: 800, height: 400 };

/** Installs a deterministic rectangle on one jsdom element. */
function setRect(element: Element, rect: OutputInspectionRect): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(rect.x, rect.y, rect.width, rect.height),
  );
}

/** Mounts one generic output frame with optional Plotly diagnostic markup. */
function mountOutput(options?: { plotly?: boolean; zeroSize?: boolean }): HTMLElement {
  document.body.innerHTML = `
    <div data-orion-notebook-view="notebook" data-orion-notebook-view-active="true" aria-hidden="false">
      <div data-orion-cell-index="2" data-orion-output-count="1">
        <div id="output-2-0" data-orion-output-cell-index="2" data-orion-output-index="0" data-orion-output-view="notebook">
          <div data-orion-output-frame>
            ${options?.plotly ? `
              <div class="orion-plotly-output">
                <svg class="main-svg">
                  <clipPath class="plotclip"><rect width="640" height="260"></rect></clipPath>
                  <text class="gtitle"></text>
                  <g class="legend"></g>
                  <text class="xtitle"></text>
                  <text class="ytitle"></text>
                  <g class="annotation"></g>
                </svg>
              </div>
            ` : "<pre>generic output</pre>"}
          </div>
        </div>
      </div>
    </div>`;
  const output = document.getElementById("output-2-0")!;
  const frame = output.querySelector("[data-orion-output-frame]")!;
  const size = options?.zeroSize ? { ...container, width: 0, height: 0 } : container;
  setRect(frame, size);
  const plot = output.querySelector(".orion-plotly-output");
  if (plot) {
    setRect(plot, size);
    const svg = plot.querySelector("svg")!;
    setRect(svg, size);
    setRect(plot.querySelector(".gtitle")!, { x: 20, y: 12, width: 180, height: 24 });
    setRect(plot.querySelector(".legend")!, { x: 560, y: 12, width: 200, height: 24 });
    setRect(plot.querySelector(".xtitle")!, { x: 350, y: 370, width: 100, height: 20 });
    setRect(plot.querySelector(".ytitle")!, { x: 8, y: 150, width: 20, height: 100 });
    setRect(plot.querySelector(".annotation")!, { x: 250, y: 80, width: 120, height: 20 });
  }
  return output;
}

/** Mounts both editor views with distinct copies of the same output. */
function mountDualViewOutput(options?: { includeAppOutput?: boolean }): {
  appFrame: HTMLElement | null;
  appPane: HTMLElement;
  notebookFrame: HTMLElement;
  notebookPane: HTMLElement;
} {
  const includeAppOutput = options?.includeAppOutput ?? true;
  document.body.innerHTML = `
    <div data-orion-notebook-view="app" data-orion-notebook-view-active="true" aria-hidden="false">
      ${includeAppOutput ? `
        <div data-orion-output-cell-index="2" data-orion-output-index="0" data-orion-output-view="app">
          <div data-orion-output-frame><span>visible app output</span></div>
        </div>
      ` : "<span>different app output</span>"}
    </div>
    <div data-orion-notebook-view="notebook" data-orion-notebook-view-active="false" aria-hidden="true" inert>
      <div data-orion-cell-index="2" data-orion-output-count="1">
        <div id="output-2-0" data-orion-output-cell-index="2" data-orion-output-index="0" data-orion-output-view="notebook">
          <div data-orion-output-frame><span>hidden notebook output</span></div>
        </div>
      </div>
    </div>`;
  const appPane = document.querySelector<HTMLElement>('[data-orion-notebook-view="app"]')!;
  const notebookPane = document.querySelector<HTMLElement>('[data-orion-notebook-view="notebook"]')!;
  const appFrame = appPane.querySelector<HTMLElement>("[data-orion-output-frame]");
  const notebookFrame = notebookPane.querySelector<HTMLElement>("[data-orion-output-frame]")!;
  if (appFrame) setRect(appFrame, container);
  setRect(notebookFrame, container);
  return { appFrame, appPane, notebookFrame, notebookPane };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.mocked(html2canvas).mockResolvedValue({
    width: 1600,
    height: 800,
    toDataURL: () => "data:image/png;base64,cG5n",
  } as HTMLCanvasElement);
});

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.scrollTop = 0;
  Reflect.deleteProperty(document.documentElement, "scrollTo");
  delete window.orionDesktopShell;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("output inspection geometry", () => {
  it("exports at double density without exceeding 1,600 pixels", () => {
    expect(getOutputInspectionScale(640, 400)).toBe(2);
    expect(getOutputInspectionScale(1_000, 500)).toBe(1.6);
    expect(getOutputInspectionScale(2_000, 1_000)).toBe(0.8);
  });

  it("detects meaningful collisions, overflow, and undersized plot areas", () => {
    expect(findRectCollision("a", null, "b", container)).toBeNull();
    expect(findRectCollision("a", { x: 0, y: 0, width: 10, height: 10 }, "b", { x: 10, y: 0, width: 10, height: 10 })).toBeNull();
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
    expect(isPlotAreaUndersized(container, { x: 0, y: 0, width: 399, height: 200 })).toBe(true);
  });
});

describe("inspectOutput", () => {
  it("captures a generic output through the browser DOM path", async () => {
    mountOutput();
    const result = await inspectOutput(2, 0);
    expect(result.text).toContain("View: notebook");
    expect(result.text).toContain("Capture method: browser-dom");
    expect(result.text).toContain("Output frame: width=800, height=400");
    expect(result.visuals[0]).toMatchObject({
      data: "cG5n",
      source: "inspect_output",
      cellIndex: 2,
      outputIndex: 0,
    });
    expect(html2canvas).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ scale: 2, width: 800, height: 400 }),
    );
  });

  it("captures the App View copy instead of the hidden Notebook View copy", async () => {
    const { appFrame, notebookFrame } = mountDualViewOutput();

    const result = await inspectOutput(2, 0);

    expect(result.text).toContain("View: app");
    expect(html2canvas).toHaveBeenCalledWith(appFrame, expect.any(Object));
    expect(html2canvas).not.toHaveBeenCalledWith(notebookFrame, expect.any(Object));
  });

  it("returns an error when the requested output is absent from active App View", async () => {
    mountDualViewOutput({ includeAppOutput: false });
    const capturePageRegion = vi.fn();
    window.orionDesktopShell = { capturePageRegion } as unknown as Window["orionDesktopShell"];

    const result = await inspectOutput(2, 0);

    expect(result.text).toBe(
      "[ERROR] Cell 2, output 0 is not included in the active App View, so inspect_output cannot see it. Add it to App View or switch to Notebook View.",
    );
    expect(result.visuals).toEqual([]);
    expect(html2canvas).not.toHaveBeenCalled();
    expect(capturePageRegion).not.toHaveBeenCalled();
  });

  it("rejects an active-view target when its pane is hidden or inert", async () => {
    const { appPane } = mountDualViewOutput();
    appPane.setAttribute("aria-hidden", "true");
    appPane.inert = true;

    const result = await inspectOutput(2, 0);

    expect(result.text).toBe(
      "[ERROR] Cell 2, output 0 is not visible in the active App View, so inspect_output cannot see it.",
    );
    expect(result.visuals).toEqual([]);
    expect(html2canvas).not.toHaveBeenCalled();
  });

  it("resolves a fresh output instance after switching active views", async () => {
    const { appFrame, appPane, notebookFrame, notebookPane } = mountDualViewOutput();
    const appResult = await inspectOutput(2, 0);

    appPane.dataset.orionNotebookViewActive = "false";
    appPane.setAttribute("aria-hidden", "true");
    appPane.inert = true;
    notebookPane.dataset.orionNotebookViewActive = "true";
    notebookPane.setAttribute("aria-hidden", "false");
    notebookPane.inert = false;
    const notebookResult = await inspectOutput(2, 0);

    expect(appResult.text).toContain("View: app");
    expect(notebookResult.text).toContain("View: notebook");
    expect(vi.mocked(html2canvas).mock.calls[0]?.[0]).toBe(appFrame);
    expect(vi.mocked(html2canvas).mock.calls[1]?.[0]).toBe(notebookFrame);
  });

  it("does not capture a stale output when the active view changes during render settling", async () => {
    const { appPane, notebookPane } = mountDualViewOutput();
    let animationFrameCount = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrameCount += 1;
      if (animationFrameCount === 1) {
        appPane.dataset.orionNotebookViewActive = "false";
        appPane.setAttribute("aria-hidden", "true");
        appPane.inert = true;
        notebookPane.dataset.orionNotebookViewActive = "true";
        notebookPane.setAttribute("aria-hidden", "false");
        notebookPane.inert = false;
      }
      callback(0);
      return animationFrameCount;
    });

    const result = await inspectOutput(2, 0);

    expect(result.text).toBe(
      "[ERROR] Cell 2, output 0 is no longer visible in the active App View, so inspect_output cannot see it.",
    );
    expect(result.visuals).toEqual([]);
    expect(html2canvas).not.toHaveBeenCalled();
  });

  it("retains Plotly-specific diagnostics on the generic capture path", async () => {
    mountOutput({ plotly: true });
    const result = await inspectOutput(2, 0);
    expect(result.text).toContain("Plotly diagnostics:");
    expect(result.text).toContain("Plot area: x=0, y=0, width=640, height=260");
    expect(result.text).toContain("Collisions: none detected");
  });

  it("uses Electron compositor pixels and restores the outer scroll position", async () => {
    const output = mountOutput();
    const frame = output.querySelector<HTMLElement>("[data-orion-output-frame]")!;
    const documentScroller = document.documentElement;
    documentScroller.scrollTop = 50;
    vi.spyOn(frame, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 1_000 - documentScroller.scrollTop, 800, 400),
    );
    frame.scrollIntoView = vi.fn(() => {
      documentScroller.scrollTop = 1_000;
    });
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      documentScroller.scrollTop = options.top ?? documentScroller.scrollTop;
      documentScroller.scrollLeft = options.left ?? documentScroller.scrollLeft;
    });
    documentScroller.scrollTo = scrollTo as unknown as typeof documentScroller.scrollTo;
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,Y29tcG9zaXRvcg==");
    vi.stubGlobal("Image", class {
      src = "";
      naturalWidth = 800;
      naturalHeight = 400;
      async decode(): Promise<void> {}
    });
    const capturePageRegion = vi.fn().mockResolvedValue({
      data: "dGlsZQ==",
      width: 800,
      height: 400,
    });
    window.orionDesktopShell = { capturePageRegion } as unknown as Window["orionDesktopShell"];

    const result = await inspectOutput(2, 0);

    expect(result.text).toContain("Capture method: electron-compositor");
    expect(result.visuals[0]?.data).toBe("Y29tcG9zaXRvcg==");
    expect(capturePageRegion).toHaveBeenCalledWith({ x: 0, y: 0, width: 800, height: 400 });
    expect(drawImage).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 50, behavior: "instant" });
  });

  it("distinguishes invalid, hidden, and zero-size outputs", async () => {
    expect((await inspectOutput(9, 0)).text).toContain("Cell 9 is invalid");
    document.body.innerHTML = '<div data-orion-notebook-view="notebook" data-orion-notebook-view-active="true" aria-hidden="false"><div data-orion-cell-index="2" data-orion-output-count="1"></div></div>';
    expect((await inspectOutput(2, 2)).text).toContain("Output 2 is invalid");
    expect((await inspectOutput(2, 0)).text).toContain("hidden or not mounted");
    mountOutput({ zeroSize: true });
    expect((await inspectOutput(2, 0)).text).toContain("zero-size frame");
  });

  it("fails rather than returning a partial browser capture for embedded content", async () => {
    const output = mountOutput();
    output.querySelector("[data-orion-output-frame]")!.append(document.createElement("iframe"));
    const result = await inspectOutput(2, 0);
    expect(result.text).toContain("cannot faithfully rasterize embedded <iframe>");
    expect(result.visuals).toEqual([]);
    expect(html2canvas).not.toHaveBeenCalled();
  });

  it("fails browser capture when a cross-origin background could be omitted", async () => {
    const output = mountOutput();
    const frame = output.querySelector<HTMLElement>("[data-orion-output-frame]")!;
    frame.style.backgroundImage = 'url("https://example.com/output.png")';
    const result = await inspectOutput(2, 0);
    expect(result.text).toContain("cross-origin background image");
    expect(result.visuals).toEqual([]);
    expect(html2canvas).not.toHaveBeenCalled();
  });
});
