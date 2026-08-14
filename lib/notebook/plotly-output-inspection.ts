import type { ExecutionToolResult } from "@/lib/agent/visual-evidence";
import { loadPlotly } from "@/lib/notebook/plotly-runtime";

/** Preferred density for model-facing Plotly snapshots. */
const PLOTLY_INSPECTION_EXPORT_SCALE = 2;
/** Prevents high-density exports from exceeding a useful model-input resolution. */
const PLOTLY_INSPECTION_MAX_DIMENSION_PX = 1600;

/** Returns a high-density export scale capped at the model-facing dimension limit. */
export function getPlotlyInspectionExportScale(width: number, height: number): number {
  return Math.min(
    PLOTLY_INSPECTION_EXPORT_SCALE,
    PLOTLY_INSPECTION_MAX_DIMENSION_PX / Math.max(width, height),
  );
}

const COLLISION_TOLERANCE_PX = 2;
const RENDER_TIMEOUT_MS = 3000;

/** Serializable rectangle used by rendered Plotly diagnostics. */
export interface PlotlyInspectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Named collision between two rendered Plotly decorations. */
export interface PlotlyInspectionCollision {
  first: string;
  second: string;
  width: number;
  height: number;
}

/** Returns the overlap exceeding the tolerance, or null when rectangles only touch. */
export function findRectCollision(
  firstName: string,
  first: PlotlyInspectionRect | null,
  secondName: string,
  second: PlotlyInspectionRect | null,
  tolerance = COLLISION_TOLERANCE_PX,
): PlotlyInspectionCollision | null {
  if (!first || !second) return null;
  const width = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const height = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  if (width <= tolerance || height <= tolerance) return null;
  return { first: firstName, second: secondName, width, height };
}

/** Returns how far a rectangle extends beyond its container on each edge. */
export function findRectOverflow(
  container: PlotlyInspectionRect,
  target: PlotlyInspectionRect | null,
  tolerance = COLLISION_TOLERANCE_PX,
): { top: number; right: number; bottom: number; left: number } | null {
  if (!target) return null;
  const overflow = {
    top: Math.max(0, container.y - target.y),
    right: Math.max(0, target.x + target.width - (container.x + container.width)),
    bottom: Math.max(0, target.y + target.height - (container.y + container.height)),
    left: Math.max(0, container.x - target.x),
  };
  return Object.values(overflow).some((value) => value > tolerance) ? overflow : null;
}

/** Returns true when either usable plot dimension is below half its container. */
export function isPlotAreaUndersized(
  container: PlotlyInspectionRect,
  plotArea: PlotlyInspectionRect | null,
): boolean {
  return !!plotArea && (
    plotArea.width < container.width * 0.5 ||
    plotArea.height < container.height * 0.5
  );
}

/** Converts a DOM rectangle into coordinates relative to the output container. */
function relativeRect(rect: DOMRect, container: DOMRect): PlotlyInspectionRect {
  return {
    x: Math.round((rect.left - container.left) * 10) / 10,
    y: Math.round((rect.top - container.top) * 10) / 10,
    width: Math.round(rect.width * 10) / 10,
    height: Math.round(rect.height * 10) / 10,
  };
}

/** Reads the first visible element matching a Plotly decoration selector. */
function readElementRect(
  root: HTMLElement,
  selector: string,
  container: DOMRect,
): PlotlyInspectionRect | null {
  const element = root.querySelector<HTMLElement | SVGElement>(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return relativeRect(rect, container);
}

/** Reads all visible annotation bounds as one union rectangle. */
function readAnnotationRect(root: HTMLElement, container: DOMRect): PlotlyInspectionRect | null {
  const rects = Array.from(root.querySelectorAll<SVGElement>(".annotation"))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return relativeRect(new DOMRect(left, top, right - left, bottom - top), container);
}

/** Reads Plotly's plot clip rectangle, which represents the usable plotting area. */
function readPlotAreaRect(root: HTMLElement, container: DOMRect): PlotlyInspectionRect | null {
  const clipRect = root.querySelector<SVGRectElement>("clipPath.plotclip rect");
  if (!clipRect) return null;
  const rect = clipRect.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return relativeRect(rect, container);

  const width = Number(clipRect.getAttribute("width"));
  const height = Number(clipRect.getAttribute("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { x: 0, y: 0, width, height };
}

/** Waits for the current Plotly output to finish producing its live SVG. */
async function waitForRenderedPlot(root: HTMLElement): Promise<HTMLDivElement | null> {
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  const startedAt = performance.now();
  while (performance.now() - startedAt < RENDER_TIMEOUT_MS) {
    const plotNode = root.querySelector<HTMLDivElement>(".orion-plotly-output");
    const rect = plotNode?.getBoundingClientRect();
    if (plotNode && rect && rect.width > 0 && rect.height > 0 && plotNode.querySelector("svg.main-svg")) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return plotNode;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
  return null;
}

/** Formats one rectangle for concise model-readable diagnostics. */
function formatRect(name: string, rect: PlotlyInspectionRect | null): string {
  if (!rect) return `${name}: not rendered`;
  return `${name}: x=${rect.x}, y=${rect.y}, width=${rect.width}, height=${rect.height}`;
}

/** Inspects a mounted Plotly output and returns diagnostics plus its rendered PNG. */
export async function inspectPlotlyOutput(
  cellIndex: number,
  outputIndex: number,
): Promise<ExecutionToolResult> {
  const cell = document.querySelector<HTMLElement>(`[data-orion-cell-index="${cellIndex}"]`);
  if (!cell) {
    return { text: `[ERROR] Cell ${cellIndex} is invalid or is not mounted in the current notebook.`, visuals: [] };
  }

  const outputCount = Number(cell.dataset.orionOutputCount ?? 0);
  if (outputIndex < 0 || outputIndex >= outputCount) {
    return {
      text: `[ERROR] Output ${outputIndex} is invalid for cell ${cellIndex}; the cell has ${outputCount} output(s).`,
      visuals: [],
    };
  }

  const output = document.getElementById(`output-${cellIndex}-${outputIndex}`);
  if (!output) {
    return {
      text: `[ERROR] Cell ${cellIndex}, output ${outputIndex} exists but is hidden or not mounted. Show the output before inspecting it.`,
      visuals: [],
    };
  }
  if (!output.querySelector(".orion-plotly-output")) {
    return {
      text: `[ERROR] Cell ${cellIndex}, output ${outputIndex} is not a rendered Plotly JSON output.`,
      visuals: [],
    };
  }

  const plotNode = await waitForRenderedPlot(output);
  if (!plotNode) {
    const unresolvedPlotNode = output.querySelector<HTMLElement>(".orion-plotly-output");
    const unresolvedRect = unresolvedPlotNode?.getBoundingClientRect();
    if (unresolvedRect && (unresolvedRect.width <= 0 || unresolvedRect.height <= 0)) {
      return {
        text: `[ERROR] Plotly output ${cellIndex}:${outputIndex} has a zero-size container.`,
        visuals: [],
      };
    }
    return {
      text: `[ERROR] Plotly render timed out for cell ${cellIndex}, output ${outputIndex}.`,
      visuals: [],
    };
  }

  const outputDomRect = output.getBoundingClientRect();
  if (outputDomRect.width <= 0 || outputDomRect.height <= 0) {
    return {
      text: `[ERROR] Plotly output ${cellIndex}:${outputIndex} has a zero-size container.`,
      visuals: [],
    };
  }

  const container: PlotlyInspectionRect = {
    x: 0,
    y: 0,
    width: Math.round(outputDomRect.width * 10) / 10,
    height: Math.round(outputDomRect.height * 10) / 10,
  };
  const svg = readElementRect(plotNode, "svg.main-svg", outputDomRect);
  const plotArea = readPlotAreaRect(plotNode, outputDomRect);
  const title = readElementRect(plotNode, ".gtitle", outputDomRect);
  const legend = readElementRect(plotNode, ".legend", outputDomRect);
  const modebar = readElementRect(plotNode, ".modebar", outputDomRect);
  const xAxisTitle = readElementRect(plotNode, ".xtitle", outputDomRect);
  const yAxisTitle = readElementRect(plotNode, ".ytitle", outputDomRect);
  const annotations = readAnnotationRect(plotNode, outputDomRect);

  const collisions = [
    findRectCollision("title", title, "legend", legend),
    findRectCollision("title", title, "modebar", modebar),
    findRectCollision("legend", legend, "modebar", modebar),
  ].filter((collision): collision is PlotlyInspectionCollision => collision !== null);

  const decorationRects = { title, legend, modebar, xAxisTitle, yAxisTitle, annotations };
  const overflows = Object.entries(decorationRects)
    .map(([name, rect]) => ({ name, overflow: findRectOverflow(container, rect) }))
    .filter((item): item is { name: string; overflow: NonNullable<typeof item.overflow> } => item.overflow !== null);
  const plotAreaWarning = isPlotAreaUndersized(container, plotArea);

  const lines = [
    `[Plotly rendered inspection: cell ${cellIndex}, output ${outputIndex}]`,
    formatRect("Output", container),
    formatRect("SVG", svg),
    formatRect("Plot area", plotArea),
    formatRect("Title", title),
    formatRect("Legend", legend),
    formatRect("Modebar", modebar),
    formatRect("X axis title", xAxisTitle),
    formatRect("Y axis title", yAxisTitle),
    formatRect("Annotations", annotations),
    collisions.length === 0
      ? "Collisions: none detected"
      : `Collisions: ${collisions.map((item) => `${item.first}/${item.second} (${item.width.toFixed(1)}x${item.height.toFixed(1)} px)`).join(", ")}`,
    overflows.length === 0
      ? "Overflow: none detected"
      : `Overflow: ${overflows.map((item) => `${item.name} ${JSON.stringify(item.overflow)}`).join(", ")}`,
    plotAreaWarning ? "Warning: usable plot area is below 50% of the output width or height." : "Plot area: adequate",
  ];

  let pngData: string | undefined;
  let imageError: string | undefined;
  try {
    const plotly = await loadPlotly();
    const exportScale = getPlotlyInspectionExportScale(
      outputDomRect.width,
      outputDomRect.height,
    );
    const dataUrl = await plotly.toImage(plotNode, {
      format: "png",
      width: Math.round(outputDomRect.width),
      height: Math.round(outputDomRect.height),
      scale: exportScale,
    });
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) throw new Error("Plotly returned an invalid PNG data URL");
    pngData = dataUrl.slice(commaIndex + 1);
  } catch (error) {
    imageError = error instanceof Error ? error.message : String(error);
    lines.push(`Image export failed: ${imageError}`);
  }

  return {
    text: lines.join("\n"),
    visuals: pngData
      ? [{
          visualId: `plotly-${cellIndex}-${outputIndex}`,
          mimeType: "image/png",
          data: pngData,
          source: "inspect_plotly_output",
          cellIndex,
          outputIndex,
          byteLength: Math.floor((pngData.length * 3) / 4),
        }]
      : [{
          visualId: `plotly-${cellIndex}-${outputIndex}`,
          mimeType: "image/png",
          source: "inspect_plotly_output",
          cellIndex,
          outputIndex,
          byteLength: 0,
          visualInspectionUnavailableReason: imageError ?? "Plotly image export failed",
        }],
  };
}
