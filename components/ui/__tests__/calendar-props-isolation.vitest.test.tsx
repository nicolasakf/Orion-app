import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Calendar } from "@/components/ui/calendar";

afterEach(() => {
  cleanup();
});

const baseProps = {
  mode: "single" as const,
  selected: new Date(2026, 4, 27),
  captionLayout: "dropdown" as const,
  fromYear: 2020,
  toYear: 2035,
};

describe("Calendar prop isolation", () => {
  it("baseline renders grid", () => {
    render(<Calendar {...baseProps} />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("numberOfMonths undefined breaks grid", () => {
    render(<Calendar {...baseProps} numberOfMonths={undefined} />);
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("showOutsideDays true still renders grid", () => {
    render(<Calendar {...baseProps} showOutsideDays={true} />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("initialFocus still renders grid", () => {
    render(<Calendar {...baseProps} initialFocus />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("dropdown-buttons shows month navigation alongside dropdowns", () => {
    render(
      <Calendar
        {...baseProps}
        captionLayout="dropdown-buttons"
      />,
    );
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next month" })).toBeInTheDocument();
  });

  it("dropdown caption hides month navigation buttons", () => {
    render(<Calendar {...baseProps} captionLayout="dropdown" />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Go to previous month" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Go to next month" }),
    ).toBeNull();
  });

  it("selected today keeps selected color classes", () => {
    const today = new Date(2026, 4, 27);
    const { container } = render(
      <Calendar mode="single" selected={today} month={today} today={today} />,
    );

    const todayCell = container.querySelector("[aria-selected='true']");
    expect(todayCell).not.toBeNull();
    expect(todayCell?.className).toContain("border-dashed");
    expect(todayCell).toHaveAttribute("aria-selected", "true");
    expect(todayCell?.className).toContain("aria-selected:bg-primary");
    expect(todayCell?.className).toContain(
      "aria-selected:text-primary-foreground",
    );
  });
});
