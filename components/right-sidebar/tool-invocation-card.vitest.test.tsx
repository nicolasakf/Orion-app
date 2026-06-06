import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolInvocationCard } from "./tool-invocation-card";

describe("ToolInvocationCard", () => {
  it("shows a cancelled icon instead of a pending spinner for interrupted tools", () => {
    const { container } = render(
      <ToolInvocationCard
        toolName="bash"
        args={{ command: "sleep 30" }}
        result={{ error: "cancelled_by_user", durationMs: 1_500 }}
        state="output-error"
        errorText="cancelled_by_user"
      />
    );

    expect(screen.getByLabelText("Cancelled")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});
