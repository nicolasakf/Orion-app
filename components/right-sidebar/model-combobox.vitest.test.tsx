import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ModelCombobox, selectPinnedModels } from "./model-combobox";
import type { LLM } from "./types";

const models = [
  {
    value: "gpt-test",
    label: "GPT Test",
    provider: "openai",
    isAccessible: true,
    supportsToolCalling: true,
  },
  {
    value: "claude-test",
    label: "Claude Test",
    provider: "anthropic",
    isAccessible: true,
    supportsToolCalling: true,
  },
] as unknown as LLM[];

const pinnedModelIds = ["openai/gpt-test", "anthropic/claude-test"];

describe("selectPinnedModels", () => {
  it("resolves pinned ids in pin order and skips ids missing from the catalog", () => {
    const pinned = selectPinnedModels(models, [
      "anthropic/claude-test",
      "openai/not-in-catalog",
      "openai/gpt-test",
    ]);

    expect(pinned.map((model) => model.value)).toEqual(["claude-test", "gpt-test"]);
  });
});

describe("ModelCombobox", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    // cmdk scrolls the active row into view; jsdom has no such method.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("labels the trigger with the selected model", () => {
    render(
      <ModelCombobox
        models={models}
        pinnedModelIds={pinnedModelIds}
        selectedModel="anthropic/claude-test"
        onModelChange={vi.fn()}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Claude Test");
  });

  it("falls back to the placeholder when no model resolves", () => {
    render(
      <ModelCombobox
        models={models}
        pinnedModelIds={pinnedModelIds}
        selectedModel=""
        onModelChange={vi.fn()}
        open={false}
        onOpenChange={vi.fn()}
        placeholder="Choose reviewer"
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Choose reviewer");
  });

  it("reports the picked model as a provider-qualified selection key", () => {
    const onModelChange = vi.fn();
    render(
      <ModelCombobox
        models={models}
        pinnedModelIds={pinnedModelIds}
        selectedModel="openai/gpt-test"
        onModelChange={onModelChange}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Claude Test"));

    expect(onModelChange).toHaveBeenCalledWith("anthropic/claude-test");
  });
});
