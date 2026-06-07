import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRule } from "@/lib/agent/rules";
import { DEFAULT_INTERACTION_MODE_CONFIGS } from "@/lib/agent/interaction-modes";

import { ChatTextbox } from "./chat-textbox";
import type { ChatDraftAttachment, LLM } from "./types";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/hooks/use-orion-settings", () => ({
  useOrionSettings: () => ({
    effectiveSettings: {
      chat: { fontSize: 14 },
    },
  }),
}));

const models: LLM[] = [
  {
    value: "gpt-test",
    label: "GPT Test",
    provider: "openai",
    supportsImageInput: true,
  },
];

function createTextboxProps(
  props: Partial<React.ComponentProps<typeof ChatTextbox>> = {}
): React.ComponentProps<typeof ChatTextbox> {
  const textareaRef = React.createRef<HTMLTextAreaElement>();
  return {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn((event) => event.preventDefault()),
    onStop: vi.fn(),
    isLoading: false,
    interactionMode: "Agent",
    interactionModes: DEFAULT_INTERACTION_MODE_CONFIGS,
    selectedModel: "gpt-test",
    editingState: null,
    textareaRef,
    onInteractionModeChange: vi.fn(),
    onModelChange: vi.fn(),
    onCancelEdit: vi.fn(),
    models,
    modelSettings: {},
    onModelSettingsChange: vi.fn(),
    ...props,
  };
}

function renderTextbox(
  props: Partial<React.ComponentProps<typeof ChatTextbox>> = {}
) {
  return render(<ChatTextbox {...createTextboxProps(props)} />);
}

afterEach(() => {
  cleanup();
});

describe("ChatTextbox attachments", () => {
  it("opens the hidden file input through the plus button", () => {
    const onAttachFiles = vi.fn();
    const { container } = renderTextbox({ onAttachFiles });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole("button", { name: "Attach external file" }));

    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("passes selected files to the parent", () => {
    const onAttachFiles = vi.fn();
    const { container } = renderTextbox({ onAttachFiles });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onAttachFiles).toHaveBeenCalledOnce();
    expect(onAttachFiles.mock.calls[0]?.[0]?.[0]).toBe(file);
  });

  it("passes dropped files to the parent", () => {
    const onAttachFiles = vi.fn();
    const { container } = renderTextbox({ onAttachFiles });
    const form = container.querySelector("form") as HTMLFormElement;
    const file = new File(["hello"], "dropped.txt", { type: "text/plain" });
    const dataTransfer = {
      dropEffect: "none",
      files: [file],
      types: ["Files"],
    };

    fireEvent.dragEnter(form, { dataTransfer });
    expect(screen.getByText("Drop files to attach")).toBeInTheDocument();

    fireEvent.drop(form, { dataTransfer });

    expect(onAttachFiles).toHaveBeenCalledOnce();
    expect(onAttachFiles.mock.calls[0]?.[0]?.[0]).toBe(file);
    expect(screen.queryByText("Drop files to attach")).not.toBeInTheDocument();
  });

  it("passes pasted images to the parent without changing text paste", () => {
    const onAttachFiles = vi.fn();
    renderTextbox({ onAttachFiles });
    const textarea = screen.getByRole("textbox");
    const image = new File(["image"], "clipboard.png", { type: "image/png" });

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => image,
          },
        ],
      },
    });

    expect(onAttachFiles).toHaveBeenCalledOnce();
    expect(onAttachFiles.mock.calls[0]?.[0]?.[0]).toBe(image);
  });

  it("does not intercept plain text paste", () => {
    const onAttachFiles = vi.fn();
    renderTextbox({ onAttachFiles });
    const textarea = screen.getByRole("textbox");

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [
          {
            kind: "string",
            type: "text/plain",
            getAsFile: () => null,
          },
        ],
      },
    });

    expect(onAttachFiles).not.toHaveBeenCalled();
  });

  it("renders and removes attachment chips", () => {
    const attachment: ChatDraftAttachment = {
      id: "attachment-1",
      fileName: "chart.png",
      mediaType: "image/png",
      size: 4096,
      reference: {
        id: "external-file:chart",
        type: "external-file",
        label: "chart.png",
        locator: {
          type: "external-file",
          fileName: "chart.png",
          mediaType: "image/png",
          size: 4096,
        },
        status: "resolved",
        preview: "Image: chart.png",
        resolvedAt: "2026-05-27T00:00:00.000Z",
      },
    };
    const onAttachmentsChange = vi.fn();
    renderTextbox({ attachments: [attachment], onAttachmentsChange });

    expect(screen.getByText("chart.png")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Remove chart.png" }));

    expect(onAttachmentsChange).toHaveBeenCalledWith([]);
  });
});

describe("ChatTextbox generation state", () => {
  it("returns to compose mode when loading clears after stop", () => {
    const onStop = vi.fn();
    const props = createTextboxProps({ isLoading: true, onStop });
    const { rerender } = render(<ChatTextbox {...props} />);

    expect(
      screen.getByPlaceholderText("Queue a message · Enter to add")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop generation" }));
    expect(onStop).toHaveBeenCalledOnce();

    rerender(<ChatTextbox {...props} isLoading={false} />);

    expect(
      screen.getByPlaceholderText("Type a message · / for commands · @ for mentions")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });
});

describe("ChatTextbox rules", () => {
  it("shows active rules and opens the selected rule", () => {
    const rule: AgentRule = {
      path: "AGENTS.md",
      filename: "AGENTS.md",
      scope: "workspace",
      content: "Use project conventions.",
    };
    const onOpenRule = vi.fn();
    renderTextbox({ activeRules: [rule], onOpenRule });

    expect(screen.getByText("Rules:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AGENTS.md" }));

    expect(onOpenRule).toHaveBeenCalledWith(rule);
  });
});
