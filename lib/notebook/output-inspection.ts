import type { ExecutionToolResult } from "@/lib/agent/visual-evidence";

const OUTPUT_CAPTURE_SCALE = 2;
const OUTPUT_CAPTURE_MAX_DIMENSION_PX = 1600;
const RENDER_TIMEOUT_MS = 3000;
const COLLISION_TOLERANCE_PX = 2;
const CAPTURE_NODE_ATTRIBUTE = "data-orion-capture-node";

/** Serializable rectangle used by rendered-output diagnostics. */
export interface OutputInspectionRect {
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

interface CapturedOutput {
  data: string;
  width: number;
  height: number;
  method: "electron-compositor" | "browser-dom";
}

interface ScrollSnapshot {
  element: HTMLElement;
  scrollLeft: number;
  scrollTop: number;
}

type OutputInspectionView = "app" | "notebook";

interface ActiveOutputTarget {
  frame: HTMLElement;
  output: HTMLElement;
  pane: HTMLElement;
  view: OutputInspectionView;
}

/** Returns a high-density capture scale capped at the model-facing dimension limit. */
export function getOutputInspectionScale(width: number, height: number): number {
  return Math.min(
    OUTPUT_CAPTURE_SCALE,
    OUTPUT_CAPTURE_MAX_DIMENSION_PX / Math.max(width, height),
  );
}

/** Returns the overlap exceeding the tolerance, or null when rectangles only touch. */
export function findRectCollision(
  firstName: string,
  first: OutputInspectionRect | null,
  secondName: string,
  second: OutputInspectionRect | null,
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
  container: OutputInspectionRect,
  target: OutputInspectionRect | null,
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

/** Returns true when either usable Plotly dimension is below half its container. */
export function isPlotAreaUndersized(
  container: OutputInspectionRect,
  plotArea: OutputInspectionRect | null,
): boolean {
  return !!plotArea && (
    plotArea.width < container.width * 0.5 ||
    plotArea.height < container.height * 0.5
  );
}

/** Resolves after one animation frame. */
function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Waits for fonts and images, then gives layout two frames to settle. */
async function waitForRenderedOutput(target: HTMLElement): Promise<void> {
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, RENDER_TIMEOUT_MS));
  const resources = Promise.all([
    document.fonts?.ready?.catch(() => undefined) ?? Promise.resolve(),
    ...Array.from(target.querySelectorAll("img")).map((image) =>
      image.complete ? Promise.resolve() : image.decode().catch(() => undefined)
    ),
  ]).then(() => undefined);
  await Promise.race([resources, timeout]);
  await nextAnimationFrame();
  await nextAnimationFrame();
}

/** Converts a DOM rectangle into coordinates relative to the output frame. */
function relativeRect(rect: DOMRect, container: DOMRect): OutputInspectionRect {
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
): OutputInspectionRect | null {
  const element = root.querySelector<HTMLElement | SVGElement>(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? relativeRect(rect, container) : null;
}

/** Reads all visible Plotly annotation bounds as one union rectangle. */
function readAnnotationRect(root: HTMLElement, container: DOMRect): OutputInspectionRect | null {
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

/** Reads Plotly's clip rectangle, which represents the usable plotting area. */
function readPlotAreaRect(root: HTMLElement, container: DOMRect): OutputInspectionRect | null {
  const clipRect = root.querySelector<SVGRectElement>("clipPath.plotclip rect");
  if (!clipRect) return null;
  const rect = clipRect.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return relativeRect(rect, container);

  const width = Number(clipRect.getAttribute("width"));
  const height = Number(clipRect.getAttribute("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { x: 0, y: 0, width, height };
}

/** Formats one rectangle for concise model-readable diagnostics. */
function formatRect(name: string, rect: OutputInspectionRect | null): string {
  if (!rect) return `${name}: not rendered`;
  return `${name}: x=${rect.x}, y=${rect.y}, width=${rect.width}, height=${rect.height}`;
}

/** Collects Plotly-only layout diagnostics without changing the generic capture path. */
function collectPlotlyDiagnostics(frame: HTMLElement, frameRect: DOMRect): string[] {
  const plotNode = frame.querySelector<HTMLElement>(".orion-plotly-output");
  if (!plotNode) return [];

  const container: OutputInspectionRect = {
    x: 0,
    y: 0,
    width: Math.round(frameRect.width * 10) / 10,
    height: Math.round(frameRect.height * 10) / 10,
  };
  const svg = readElementRect(plotNode, "svg.main-svg", frameRect);
  const plotArea = readPlotAreaRect(plotNode, frameRect);
  const title = readElementRect(plotNode, ".gtitle", frameRect);
  const legend = readElementRect(plotNode, ".legend", frameRect);
  const modebar = readElementRect(plotNode, ".modebar", frameRect);
  const xAxisTitle = readElementRect(plotNode, ".xtitle", frameRect);
  const yAxisTitle = readElementRect(plotNode, ".ytitle", frameRect);
  const annotations = readAnnotationRect(plotNode, frameRect);
  const collisions = [
    findRectCollision("title", title, "legend", legend),
    findRectCollision("title", title, "modebar", modebar),
    findRectCollision("legend", legend, "modebar", modebar),
  ].filter((collision): collision is PlotlyInspectionCollision => collision !== null);
  const overflows = Object.entries({ title, legend, modebar, xAxisTitle, yAxisTitle, annotations })
    .map(([name, rect]) => ({ name, overflow: findRectOverflow(container, rect) }))
    .filter((item): item is { name: string; overflow: NonNullable<typeof item.overflow> } => item.overflow !== null);

  return [
    "Plotly diagnostics:",
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
    isPlotAreaUndersized(container, plotArea)
      ? "Warning: usable plot area is below 50% of the output width or height."
      : "Plot area: adequate",
  ];
}

/** Returns every scrollable ancestor whose position must be restored after desktop capture. */
function getScrollableAncestors(target: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = target.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScroll = /(auto|scroll|overlay)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
    if (canScroll && (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth)) {
      ancestors.push(current);
    }
    current = current.parentElement;
  }
  const documentScroller = document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
  if (!ancestors.includes(documentScroller)) {
    ancestors.push(documentScroller);
  }
  return ancestors;
}

/** Returns the on-screen viewport provided by a scroll container. */
function getScrollViewport(scroller: HTMLElement): OutputInspectionRect {
  if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
    return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  }
  const rect = scroller.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Intersects multiple scroll viewports with the browser's visible content area. */
function getCombinedScrollViewport(scrollers: HTMLElement[]): OutputInspectionRect {
  const viewports = scrollers.map(getScrollViewport);
  const left = Math.max(0, ...viewports.map((viewport) => viewport.x));
  const top = Math.max(0, ...viewports.map((viewport) => viewport.y));
  const right = Math.min(window.innerWidth, ...viewports.map((viewport) => viewport.x + viewport.width));
  const bottom = Math.min(window.innerHeight, ...viewports.map((viewport) => viewport.y + viewport.height));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Loads a base64 PNG into an image so compositor tiles can be stitched. */
async function loadPng(data: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `data:image/png;base64,${data}`;
  await image.decode();
  return image;
}

/** Captures the complete output frame from Electron's compositor, tiling when necessary. */
async function captureWithElectron(frame: HTMLElement): Promise<CapturedOutput> {
  const captureRegion = window.orionDesktopShell?.capturePageRegion;
  if (!captureRegion) throw new Error("Electron compositor capture is unavailable.");

  const initialRect = frame.getBoundingClientRect();
  const width = Math.ceil(initialRect.width);
  const height = Math.ceil(initialRect.height);
  const scale = getOutputInspectionScale(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the compositor stitching canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const scrollableAncestors = getScrollableAncestors(frame);
  const snapshots: ScrollSnapshot[] = scrollableAncestors.map((element) => ({
    element,
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
  }));
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const documentScroller = document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
  const verticalScroller = scrollableAncestors.find(
    (element) => element.scrollHeight > element.clientHeight,
  ) ?? documentScroller;
  const horizontalScroller = scrollableAncestors.find(
    (element) => element.scrollWidth > element.clientWidth,
  ) ?? documentScroller;
  const captureScrollers = Array.from(new Set([verticalScroller, horizontalScroller]));

  try {
    frame.scrollIntoView({ block: "start", inline: "start", behavior: "instant" });
    await nextAnimationFrame();

    const positionedRect = frame.getBoundingClientRect();
    const verticalViewport = getScrollViewport(verticalScroller);
    const horizontalViewport = getScrollViewport(horizontalScroller);
    const contentTop = positionedRect.top - verticalViewport.y + verticalScroller.scrollTop;
    const contentLeft = positionedRect.left - horizontalViewport.x + horizontalScroller.scrollLeft;
    let localY = 0;
    let guard = 0;

    while (localY < height && guard < 1000) {
      guard += 1;
      verticalScroller.scrollTop = Math.max(0, contentTop + localY);
      await nextAnimationFrame();
      let liveRect = frame.getBoundingClientRect();
      const liveViewport = getCombinedScrollViewport(captureScrollers);
      const captureLocalTop = Math.max(localY, Math.ceil(liveViewport.y - liveRect.top), 0);
      const captureLocalBottom = Math.min(height, Math.floor(liveViewport.y + liveViewport.height - liveRect.top));
      if (captureLocalBottom <= captureLocalTop) {
        throw new Error("The output could not be brought into the visible compositor viewport.");
      }

      let localX = 0;
      while (localX < width && guard < 1000) {
        guard += 1;
        horizontalScroller.scrollLeft = Math.max(0, contentLeft + localX);
        await nextAnimationFrame();
        liveRect = frame.getBoundingClientRect();
        const tileViewport = getCombinedScrollViewport(captureScrollers);
        const captureLocalLeft = Math.max(localX, Math.ceil(tileViewport.x - liveRect.left), 0);
        const captureLocalRight = Math.min(width, Math.floor(tileViewport.x + tileViewport.width - liveRect.left));
        if (captureLocalRight <= captureLocalLeft) {
          throw new Error("The output width could not be brought into the visible compositor viewport.");
        }

        const request = {
          x: Math.max(0, Math.ceil(liveRect.left + captureLocalLeft)),
          y: Math.max(0, Math.ceil(liveRect.top + captureLocalTop)),
          width: captureLocalRight - captureLocalLeft,
          height: captureLocalBottom - captureLocalTop,
        };
        const tile = await captureRegion(request);
        const image = await loadPng(tile.data);
        context.drawImage(
          image,
          0,
          0,
          image.naturalWidth,
          image.naturalHeight,
          Math.round(captureLocalLeft * scale),
          Math.round(captureLocalTop * scale),
          Math.round(request.width * scale),
          Math.round(request.height * scale),
        );
        localX = captureLocalRight;
      }
      localY = captureLocalBottom;
    }
    if (localY < height) throw new Error("Output capture exceeded the compositor tile limit.");

    return {
      data: canvas.toDataURL("image/png").split(",", 2)[1] ?? "",
      width: canvas.width,
      height: canvas.height,
      method: "electron-compositor",
    };
  } finally {
    for (const snapshot of snapshots) {
      snapshot.element.scrollTo({ left: snapshot.scrollLeft, top: snapshot.scrollTop, behavior: "instant" });
    }
    activeElement?.focus({ preventScroll: true });
  }
}

/** Returns true when a resource URL cannot be read from Orion's browser origin. */
function isCrossOriginCaptureResource(value: string): boolean {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  if (!normalized || normalized.startsWith("data:") || normalized.startsWith("blob:")) return false;
  try {
    const url = new URL(normalized, document.baseURI);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin !== window.location.origin;
  } catch {
    return true;
  }
}

/** Returns the URLs referenced by one computed CSS background image. */
function readBackgroundImageUrls(element: Element): string[] {
  const backgroundImage = window.getComputedStyle(element).backgroundImage;
  return Array.from(backgroundImage.matchAll(/url\(([^)]+)\)/g), (match) => match[1] ?? "");
}

/** Rejects browser captures that the DOM rasterizer cannot reproduce faithfully. */
function assertBrowserCaptureSupported(frame: HTMLElement): void {
  const embedded = frame.querySelector("iframe, object, embed");
  if (embedded) {
    throw new Error(`Browser capture cannot faithfully rasterize embedded <${embedded.tagName.toLowerCase()}> content. Use the desktop app for this output.`);
  }
  for (const image of frame.querySelectorAll("img")) {
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error("Browser capture stopped because an output image did not load completely.");
    }
    if (isCrossOriginCaptureResource(image.currentSrc || image.src)) {
      throw new Error("Browser capture cannot guarantee a faithful copy of a cross-origin image. Use the desktop app for this output.");
    }
  }
  const styledElements: Element[] = [frame, ...Array.from(frame.querySelectorAll("*"))];
  if (styledElements.some((element) => readBackgroundImageUrls(element).some(isCrossOriginCaptureResource))) {
    throw new Error("Browser capture cannot guarantee a faithful copy of a cross-origin background image. Use the desktop app for this output.");
  }
  for (const svgImage of frame.querySelectorAll<SVGImageElement>("svg image")) {
    const href = svgImage.href.baseVal || svgImage.getAttribute("href") || "";
    if (isCrossOriginCaptureResource(href)) {
      throw new Error("Browser capture cannot guarantee a faithful copy of a cross-origin SVG image. Use the desktop app for this output.");
    }
  }
  for (const canvas of frame.querySelectorAll("canvas")) {
    try {
      canvas.toDataURL("image/png");
    } catch {
      throw new Error("Browser capture cannot read a cross-origin canvas. Use the desktop app for this output.");
    }
  }
}

/** Copies live scroll and form state into html2canvas's cloned document. */
function synchronizeCaptureClone(sourceNodes: HTMLElement[], clonedDocument: Document): void {
  sourceNodes.forEach((source, index) => {
    const clone = clonedDocument.querySelector<HTMLElement>(`[${CAPTURE_NODE_ATTRIBUTE}="${index}"]`);
    if (!clone) return;
    clone.scrollLeft = source.scrollLeft;
    clone.scrollTop = source.scrollTop;
    if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
      clone.value = source.value;
      clone.checked = source.checked;
    } else if (source instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) {
      clone.value = source.value;
      clone.textContent = source.value;
    } else if (source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
      clone.value = source.value;
    }
    clone.removeAttribute(CAPTURE_NODE_ATTRIBUTE);
  });
}

/** Captures a mounted output using browser DOM rasterization. */
async function captureWithBrowserDom(frame: HTMLElement): Promise<CapturedOutput> {
  assertBrowserCaptureSupported(frame);
  const rect = frame.getBoundingClientRect();
  const scale = getOutputInspectionScale(rect.width, rect.height);
  const sourceNodes = [frame, ...Array.from(frame.querySelectorAll<HTMLElement>("*"))];
  const previousMarkers = sourceNodes.map((node) => node.getAttribute(CAPTURE_NODE_ATTRIBUTE));
  sourceNodes.forEach((node, index) => node.setAttribute(CAPTURE_NODE_ATTRIBUTE, String(index)));

  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(frame, {
      backgroundColor: null,
      height: Math.ceil(rect.height),
      width: Math.ceil(rect.width),
      logging: false,
      onclone: (clonedDocument) => synchronizeCaptureClone(sourceNodes, clonedDocument),
      scale,
      useCORS: true,
    });
    const data = canvas.toDataURL("image/png").split(",", 2)[1];
    if (!data) throw new Error("DOM rasterization returned an empty PNG.");
    return { data, width: canvas.width, height: canvas.height, method: "browser-dom" };
  } finally {
    sourceNodes.forEach((node, index) => {
      const previous = previousMarkers[index];
      if (previous === null) node.removeAttribute(CAPTURE_NODE_ATTRIBUTE);
      else node.setAttribute(CAPTURE_NODE_ATTRIBUTE, previous);
    });
  }
}

/** Returns true when an element and its ancestors are visible inside the active pane. */
function isVisibleInsideActivePane(element: HTMLElement, pane: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.getAttribute("aria-hidden") === "true" || current.inert) return false;
    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      (style.opacity !== "" && Number(style.opacity) === 0)
    ) {
      return false;
    }
    if (current === pane) return true;
    current = current.parentElement;
  }
  return false;
}

/** Resolves the requested output only from Orion's explicitly active notebook pane. */
function resolveActiveOutputTarget(
  cellIndex: number,
  outputIndex: number,
): ActiveOutputTarget | { error: string } {
  const pane = document.querySelector<HTMLElement>(
    '[data-orion-notebook-view][data-orion-notebook-view-active="true"]',
  );
  const rawView = pane?.dataset.orionNotebookView;
  if (!pane || (rawView !== "app" && rawView !== "notebook")) {
    return { error: "[ERROR] inspect_output cannot determine the active notebook view." };
  }

  const view: OutputInspectionView = rawView;
  const output = pane.querySelector<HTMLElement>(
    `[data-orion-output-cell-index="${cellIndex}"][data-orion-output-index="${outputIndex}"][data-orion-output-view="${view}"]`,
  );
  if (!output) {
    if (view === "app") {
      return {
        error: `[ERROR] Cell ${cellIndex}, output ${outputIndex} is not included in the active App View, so inspect_output cannot see it. Add it to App View or switch to Notebook View.`,
      };
    }
    return {
      error: `[ERROR] Cell ${cellIndex}, output ${outputIndex} exists but is hidden or not mounted. Show the output before inspecting it.`,
    };
  }

  const frame = output.querySelector<HTMLElement>("[data-orion-output-frame]");
  if (!frame || !isVisibleInsideActivePane(frame, pane)) {
    return {
      error: `[ERROR] Cell ${cellIndex}, output ${outputIndex} is not visible in the active ${view === "app" ? "App" : "Notebook"} View, so inspect_output cannot see it.`,
    };
  }
  return { frame, output, pane, view };
}

/** Inspects any mounted notebook output and returns its current rendered PNG. */
export async function inspectOutput(cellIndex: number, outputIndex: number): Promise<ExecutionToolResult> {
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
  const target = resolveActiveOutputTarget(cellIndex, outputIndex);
  if ("error" in target) return { text: target.error, visuals: [] };
  const { frame, pane, view } = target;

  await waitForRenderedOutput(frame);
  if (
    pane.dataset.orionNotebookViewActive !== "true" ||
    !isVisibleInsideActivePane(frame, pane)
  ) {
    return {
      text: `[ERROR] Cell ${cellIndex}, output ${outputIndex} is no longer visible in the active ${view === "app" ? "App" : "Notebook"} View, so inspect_output cannot see it.`,
      visuals: [],
    };
  }
  const frameRect = frame.getBoundingClientRect();
  if (frameRect.width <= 0 || frameRect.height <= 0) {
    return { text: `[ERROR] Output ${cellIndex}:${outputIndex} has a zero-size frame.`, visuals: [] };
  }

  try {
    const captured = window.orionDesktopShell?.capturePageRegion
      ? await captureWithElectron(frame)
      : await captureWithBrowserDom(frame);
    const lines = [
      `[Rendered output inspection: cell ${cellIndex}, output ${outputIndex}]`,
      `View: ${view}`,
      `Capture method: ${captured.method}`,
      `Output frame: width=${Math.round(frameRect.width * 10) / 10}, height=${Math.round(frameRect.height * 10) / 10}`,
      `Model image: width=${captured.width}, height=${captured.height}`,
      `Scroll state: left=${frame.scrollLeft}, top=${frame.scrollTop}, scrollWidth=${frame.scrollWidth}, scrollHeight=${frame.scrollHeight}, clientWidth=${frame.clientWidth}, clientHeight=${frame.clientHeight}`,
      `Clipping: ${frame.scrollWidth > frame.clientWidth || frame.scrollHeight > frame.clientHeight ? "content is clipped to the current output viewport" : "none detected"}`,
      ...collectPlotlyDiagnostics(frame, frameRect),
    ];
    return {
      text: lines.join("\n"),
      visuals: [{
        visualId: `output-${cellIndex}-${outputIndex}`,
        mimeType: "image/png",
        data: captured.data,
        source: "inspect_output",
        cellIndex,
        outputIndex,
        byteLength: Math.floor((captured.data.length * 3) / 4),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: `[ERROR] Could not faithfully inspect cell ${cellIndex}, output ${outputIndex}: ${message}`,
      visuals: [],
    };
  }
}
