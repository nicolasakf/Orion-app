import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlotlyJsonOutputRenderer } from "@/components/notebook/renderers/plotly-json";
import type { NotebookMimeRendererProps } from "@/components/notebook/renderers/types";
import { loadPlotly } from "@/lib/notebook/plotly-runtime";
import { OutputType, type NotebookOutputType } from "@/lib/types";

const plotlyMocks = vi.hoisted(() => ({
  react: vi.fn().mockResolvedValue(undefined),
  relayout: vi.fn().mockResolvedValue(undefined),
  addFrames: vi.fn().mockResolvedValue(undefined),
  redraw: vi.fn().mockResolvedValue(undefined),
  purge: vi.fn(),
  toImage: vi.fn().mockResolvedValue("data:image/png;base64,cG5n"),
}));

vi.mock("@/lib/notebook/plotly-runtime", () => ({
  loadPlotly: vi.fn(async () => plotlyMocks),
}));

let currentWidth = 800;
let resizeCallbacks: ResizeObserverCallback[] = [];
let rectSpy: ReturnType<typeof vi.spyOn>;

/** Creates the shared renderer props used by responsive Plotly tests. */
function createProps(
  value: Record<string, unknown>,
  overrides?: Partial<NotebookMimeRendererProps>,
): NotebookMimeRendererProps {
  const output: NotebookOutputType = {
    output_type: OutputType.DISPLAY_DATA,
    data: { "application/vnd.plotly.v1+json": value },
    metadata: {},
  };
  return {
    output,
    mimeType: "application/vnd.plotly.v1+json",
    value,
    theme: "light",
    trusted: true,
    ansiConverter: {} as NotebookMimeRendererProps["ansiConverter"],
    sanitize: (html) => html,
    actions: { cellIndex: 1, outputIndex: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  currentWidth = 800;
  resizeCallbacks = [];
  Object.values(plotlyMocks).forEach((mock) => mock.mockClear());
  vi.mocked(loadPlotly).mockResolvedValue(plotlyMocks as never);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeCallbacks.push(callback);
      }
      observe(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class IntersectionObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const styledWidth = Number.parseFloat(this.style.width);
    const width = Number.isFinite(styledWidth) ? styledWidth : currentWidth;
    const styledHeight = Number.parseFloat(this.style.height);
    const height = Number.isFinite(styledHeight) ? styledHeight : 420;
    return new DOMRect(0, 0, width, height);
  });
});

afterEach(() => {
  cleanup();
  rectSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("PlotlyJsonOutputRenderer sizing", () => {
  it("reparents Plotly snapshot notices into the active output frame", async () => {
    const view = render(
      <PlotlyJsonOutputRenderer
        {...createProps({ data: [], layout: { height: 360 } })}
      />,
    );
    const plotNode = view.container.querySelector<HTMLElement>(
      ".orion-plotly-output",
    )!;
    const plotHost = plotNode.parentElement!;

    await waitFor(() => expect(plotlyMocks.react).toHaveBeenCalledTimes(1));
    fireEvent.pointerDown(plotNode);

    const notifier = document.createElement("div");
    notifier.className = "plotly-notifier";
    document.body.appendChild(notifier);

    await waitFor(() => expect(plotHost).toContainElement(notifier));
    expect(notifier).toHaveStyle({
      position: "absolute",
      top: "0.5rem",
      right: "0.5rem",
    });
    expect(document.body.querySelector(":scope > .plotly-notifier")).toBeNull();
  });

  it("uses measured notebook width, ignores authored width, and relayouts on resize and interactions", async () => {
    const props = createProps({
      data: [{ type: "bar", x: ["A"], y: [1] }],
      layout: { width: 1400, height: 420, title: { text: "Chart" } },
      config: { displayModeBar: false, responsive: true },
    });
    const view = render(<PlotlyJsonOutputRenderer {...props} />);
    const plotNode = view.container.querySelector<HTMLElement>(".orion-plotly-output")!;
    const listeners = new Map<string, () => void>();
    Object.assign(plotNode, {
      on: vi.fn((eventName: string, handler: () => void) => listeners.set(eventName, handler)),
      removeListener: vi.fn((eventName: string) => listeners.delete(eventName)),
    });

    await waitFor(() => expect(plotlyMocks.react).toHaveBeenCalledTimes(1));
    const initialLayout = plotlyMocks.react.mock.calls[0]![2] as Record<string, unknown>;
    const initialConfig = plotlyMocks.react.mock.calls[0]![3] as Record<string, unknown>;
    expect(initialLayout).toMatchObject({ width: 800, height: 420, autosize: false });
    expect(initialConfig).toMatchObject({ displayModeBar: false, responsive: false });
    expect(plotNode.parentElement).toHaveClass("overflow-hidden");
    expect(plotNode.parentElement).toHaveStyle({ height: "420px" });

    currentWidth = 640;
    resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
    await waitFor(() => expect(plotlyMocks.relayout).toHaveBeenCalledWith(plotNode, { width: 640, autosize: false }));

    plotlyMocks.relayout.mockClear();
    listeners.get("plotly_legendclick")?.();
    await waitFor(() => expect(plotlyMocks.relayout).toHaveBeenCalledWith(plotNode, { width: 640, autosize: false }));

    view.rerender(<PlotlyJsonOutputRenderer {...props} theme="dark" />);
    await waitFor(() => expect(plotlyMocks.react).toHaveBeenCalledTimes(2));
    expect((plotlyMocks.react.mock.calls[1]![2] as Record<string, { color?: string }>).font?.color).toBe("#ffffff");

    view.unmount();
    await waitFor(() => expect(plotlyMocks.purge).toHaveBeenCalledWith(plotNode));
  });

  it("waits for fonts before the initial Plotly render", async () => {
    let resolveFonts: (() => void) | undefined;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: new Promise<void>((resolve) => { resolveFonts = resolve; }) },
    });
    render(<PlotlyJsonOutputRenderer {...createProps({ data: [], layout: { height: 360 } })} />);
    await Promise.resolve();
    expect(plotlyMocks.react).not.toHaveBeenCalled();
    resolveFonts?.();
    await waitFor(() => expect(plotlyMocks.react).toHaveBeenCalledTimes(1));
  });

  it("preserves and caps authored width in fullscreen", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    render(
      <PlotlyJsonOutputRenderer
        {...createProps(
          { data: [], layout: { width: 2000, height: 400 } },
          { actions: { cellIndex: 1, outputIndex: 0, isFullScreen: true } },
        )}
      />,
    );
    await waitFor(() => expect(plotlyMocks.react).toHaveBeenCalledTimes(1));
    expect(plotlyMocks.react.mock.calls[0]![2]).toMatchObject({ width: 950, height: 720, autosize: false });
  });
});
