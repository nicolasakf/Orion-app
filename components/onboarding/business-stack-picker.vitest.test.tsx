import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BusinessStackPicker } from "@/components/onboarding/business-stack-picker";
import {
  BUSINESS_TOOL_CATEGORIES,
  createEmptyBusinessStackSelection,
  type BusinessStackSelection,
} from "@/lib/onboarding/business-tools";

/** Renders the picker as a controlled component so changes are observable. */
function renderPicker(
  overrides: Partial<React.ComponentProps<typeof BusinessStackPicker>> = {},
) {
  const onComplete = vi.fn();
  function Harness() {
    const [value, setValue] = React.useState<BusinessStackSelection>(
      createEmptyBusinessStackSelection,
    );
    return (
      <BusinessStackPicker
        value={value}
        onChange={setValue}
        onComplete={onComplete}
        {...overrides}
      />
    );
  }
  render(<Harness />);
  return { onComplete };
}

/** Opens the category filter dropdown and selects one option. */
function chooseCategory(label: string | RegExp) {
  fireEvent.click(screen.getByRole("combobox", { name: "Tool category" }));
  fireEvent.click(screen.getByRole("option", { name: label }));
}

describe("BusinessStackPicker", () => {
  it("shows every category on one screen without stepping", () => {
    renderPicker();
    for (const category of BUSINESS_TOOL_CATEGORIES) {
      expect(
        screen.getByRole("heading", { name: category.label }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: /Slack/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Salesforce/ })).toBeInTheDocument();
  });

  it("finds a tool by name from any category via search", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "salesforce" } });
    expect(screen.getByRole("checkbox", { name: /Salesforce/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Slack/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Communication" }),
    ).not.toBeInTheDocument();
  });

  it("finds a tool by alias", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ga4" } });
    expect(
      screen.getByRole("checkbox", { name: /Google Analytics/ }),
    ).toBeInTheDocument();
  });

  it("toggles a tool on and back off", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Slack/ }));
    expect(screen.getByRole("checkbox", { name: /Slack/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Slack/ }));
    expect(screen.getByRole("checkbox", { name: /Slack/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("files a picked tool under its own category", () => {
    const onChange = vi.fn();
    render(
      <BusinessStackPicker
        value={createEmptyBusinessStackSelection()}
        onChange={onChange}
        onComplete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Salesforce/ }));
    const next = onChange.mock.calls[0][0] as BusinessStackSelection;
    expect(next.categories.crm?.toolIds).toEqual(["salesforce"]);
    expect(next.categories.communication).toBeUndefined();
  });

  it("filters the grid to one category from the dropdown, and back", () => {
    renderPicker();
    chooseCategory("Data & reporting");
    expect(screen.getByRole("heading", { name: "Data & reporting" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Communication" }),
    ).not.toBeInTheDocument();

    chooseCategory("All tools");
    expect(screen.getByRole("heading", { name: "Communication" })).toBeInTheDocument();
  });

  it("counts selected tools per category in the dropdown", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Slack/ }));
    fireEvent.click(screen.getByRole("combobox", { name: "Tool category" }));
    expect(
      screen.getByRole("option", { name: /Communication \(1 tool\)/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /Communication \(1 tool\)/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Zoom/ }));
    fireEvent.click(screen.getByRole("combobox", { name: "Tool category" }));
    expect(
      screen.getByRole("option", { name: /Communication \(2 tools\)/ }),
    ).toBeInTheDocument();
  });

  it("adds an unknown tool under the chosen category", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Acme Messenger" },
    });
    fireEvent.change(screen.getByLabelText("under"), {
      target: { value: "communication" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add “Acme Messenger”/ }));

    expect(screen.getByText("Acme Messenger")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Tool category" }));
    expect(
      screen.getByRole("option", { name: /Communication \(1 tool\)/ }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Acme Messenger" }));
    expect(screen.queryByText("Acme Messenger")).not.toBeInTheDocument();
  });

  it("targets the active category when the dropdown is filtered", () => {
    renderPicker();
    chooseCategory(/CRM & sales/);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Acme CRM" } });
    expect(screen.queryByLabelText("under")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add “Acme CRM”/ }));
    expect(screen.getByText("Acme CRM")).toBeInTheDocument();
  });

  it("reports the running total and moves on when Next is pressed", () => {
    const { onComplete } = renderPicker();
    expect(screen.getByText("No tools selected yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Slack/ }));
    expect(screen.getByText("1 tool selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("lets the user leave without selecting anything", () => {
    const { onComplete } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
