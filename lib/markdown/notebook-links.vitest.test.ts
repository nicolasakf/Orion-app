import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleNotebookRenderedLinkClick,
  isInternalNotebookAnchor,
  openNotebookLinkExternally,
  shouldOpenNotebookLinkExternally,
} from "@/lib/markdown/notebook-links";

describe("notebook link helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects in-page anchors", () => {
    expect(isInternalNotebookAnchor("#section")).toBe(true);
    expect(isInternalNotebookAnchor("https://example.com")).toBe(false);
    expect(isInternalNotebookAnchor("#")).toBe(false);
  });

  it("detects external notebook links", () => {
    expect(shouldOpenNotebookLinkExternally("https://plotly.com/python/")).toBe(
      true,
    );
    expect(shouldOpenNotebookLinkExternally("//example.com/docs")).toBe(true);
    expect(shouldOpenNotebookLinkExternally("mailto:hello@example.com")).toBe(
      true,
    );
    expect(shouldOpenNotebookLinkExternally("#section")).toBe(false);
    expect(shouldOpenNotebookLinkExternally("javascript:alert(1)")).toBe(false);
    expect(shouldOpenNotebookLinkExternally("/local/path")).toBe(false);
  });

  it("opens external links in a new browser tab", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    openNotebookLinkExternally("https://example.com");

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("intercepts external anchor clicks inside rendered HTML", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const container = document.createElement("div");
    container.innerHTML =
      '<p><a href="https://plotly.com/python/">Plotly guide</a></p>';
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleNotebookRenderedLinkClick({
      defaultPrevented: false,
      preventDefault,
      stopPropagation,
      target: anchor!,
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith(
      "https://plotly.com/python/",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("intercepts legacy xlink anchors inside rendered SVG", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const container = document.createElement("div");
    container.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">',
      '<a xlink:href="https://example.com/chart"><text>Chart source</text></a>',
      "</svg>",
    ].join("");
    const text = container.querySelector("text");
    expect(text).toBeInstanceOf(SVGElement);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleNotebookRenderedLinkClick({
      defaultPrevented: false,
      preventDefault,
      stopPropagation,
      target: text!,
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/chart",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
