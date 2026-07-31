import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoundedNumberInput } from "@/components/ui/bounded-number-input";
import { TooltipProvider } from "@/components/ui/tooltip";

afterEach(() => {
  cleanup();
});

describe("BoundedNumberInput", () => {
  it("does not report fractional values for integer-backed settings", () => {
    const onValueChange = vi.fn();
    render(
      <TooltipProvider>
        <BoundedNumberInput
          integer
          min={1}
          value={1}
          onValueChange={onValueChange}
        />
      </TooltipProvider>,
    );

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "1.5" } });

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "2" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(onValueChange).toHaveBeenCalledWith(2);
  });

  it("allows fractional values when the setting supports them", () => {
    const onValueChange = vi.fn();
    render(
      <TooltipProvider>
        <BoundedNumberInput
          min={0}
          max={1}
          step={0.01}
          value={0.5}
          onValueChange={onValueChange}
        />
      </TooltipProvider>,
    );

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "0.75" },
    });

    expect(onValueChange).toHaveBeenCalledWith(0.75);
  });
});
