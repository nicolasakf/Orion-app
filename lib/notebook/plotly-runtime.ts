/** Minimal Plotly graph node contract used by Orion's renderer and inspection tool. */
export interface PlotlyGraphNode extends HTMLDivElement {
  on?: (eventName: string, handler: () => void) => void;
  removeListener?: (eventName: string, handler: () => void) => void;
}

/** Plotly APIs used by Orion without depending on the incomplete dist-bundle types. */
export interface PlotlyLike {
  react: (
    root: HTMLDivElement,
    data: unknown[],
    layout: Record<string, unknown>,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
  relayout: (
    root: HTMLDivElement,
    update: Record<string, unknown>,
  ) => Promise<unknown>;
  addFrames: (root: HTMLDivElement, frames: unknown[]) => Promise<unknown>;
  redraw: (root: HTMLDivElement) => Promise<unknown>;
  purge: (root: HTMLDivElement) => void;
  toImage: (
    root: HTMLDivElement,
    options: Record<string, unknown>,
  ) => Promise<string>;
}

let plotlyLoader: Promise<PlotlyLike> | null = null;

/** Lazily loads Plotly's browser bundle for notebook rendering and inspection. */
export async function loadPlotly(): Promise<PlotlyLike> {
  if (!plotlyLoader) {
    plotlyLoader = import(
      // @ts-expect-error plotly dist bundle does not ship typed entrypoints
      "plotly.js/dist/plotly"
    ).then((mod) => {
      const maybePlotly = (mod as unknown as { default?: PlotlyLike }).default;
      return maybePlotly ?? (mod as unknown as PlotlyLike);
    });
  }
  return plotlyLoader;
}
