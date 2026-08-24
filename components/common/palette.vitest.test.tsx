import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Palette } from "@/components/common/palette";

afterEach(() => {
  cleanup();
});

describe("Palette", () => {
  it("renders connected swatches and an optional label", () => {
    render(
      <Palette
        label="Fiery Ocean"
        value={["#780000", "#C1121F", "#FDF0D5"]}
      />,
    );

    expect(screen.getByLabelText("Fiery Ocean palette")).toBeInTheDocument();
    expect(screen.getByText("Fiery Ocean")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit color #780000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit color #C1121F" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit color #FDF0D5" })).toBeInTheDocument();
  });

  it("opens the shared color picker for the selected swatch", () => {
    render(<Palette value={["#780000", "#669BBC"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit color #669BBC" }));

    expect(screen.getByRole("textbox", { name: "Hex color" })).toHaveValue(
      "#669BBC",
    );
  });

  it("reports the complete palette when a swatch changes", () => {
    const onValueChange = vi.fn();
    render(
      <Palette
        value={["#780000", "#669BBC"]}
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit color #780000" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Hex color" }), {
      target: { value: "#ffffff" },
    });

    expect(onValueChange).toHaveBeenCalledWith(["#FFFFFF", "#669BBC"]);
  });

  it("supports an empty palette without rendering color controls", () => {
    render(<Palette value={[]} />);

    expect(screen.getByText("No colors")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("disables every color trigger", () => {
    render(<Palette disabled value={["#780000", "#669BBC"]} />);

    expect(screen.getByRole("button", { name: "Edit color #780000" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit color #669BBC" })).toBeDisabled();
  });
});
