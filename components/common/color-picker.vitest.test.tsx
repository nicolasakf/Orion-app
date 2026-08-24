import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ColorPicker } from "@/components/common/color-picker";

afterEach(() => {
  cleanup();
});

describe("ColorPicker", () => {
  it("normalizes the initial color and opens its controls", () => {
    render(<ColorPicker defaultValue="#3b82f6" />);

    const trigger = screen.getByRole("button", { name: "Choose color" });
    expect(trigger).toHaveTextContent("#3B82F6");

    fireEvent.click(trigger);

    expect(screen.getByRole("slider", { name: "Hue" })).toHaveValue("217");
    expect(screen.getByRole("textbox", { name: "Hex color" })).toHaveValue(
      "#3B82F6",
    );
  });

  it("reports normalized colors entered as hex", () => {
    const onValueChange = vi.fn();
    render(<ColorPicker value="#3B82F6" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose color" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Hex color" }), {
      target: { value: "#ff0000" },
    });

    expect(onValueChange).toHaveBeenCalledWith("#FF0000");
  });

  it("supports presets and omits invalid preset values", () => {
    const onValueChange = vi.fn();
    render(
      <ColorPicker
        value="#000000"
        onValueChange={onValueChange}
        presets={["#fff", "not-a-color"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose color" }));
    expect(screen.queryByRole("button", { name: "Use color not-a-color" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use color #FFFFFF" }));
    expect(onValueChange).toHaveBeenCalledWith("#FFFFFF");
  });

  it("restores the active color after invalid text input", () => {
    render(<ColorPicker value="#22C55E" />);

    fireEvent.click(screen.getByRole("button", { name: "Choose color" }));
    const input = screen.getByRole("textbox", { name: "Hex color" });
    fireEvent.change(input, { target: { value: "invalid" } });
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.blur(input);
    expect(input).toHaveValue("#22C55E");
    expect(input).toHaveAttribute("aria-invalid", "false");
  });
});
