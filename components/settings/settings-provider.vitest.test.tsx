import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import {
  SettingsProvider,
  useSettingsContext,
} from "@/components/settings/settings-provider";

function SettingsProbe() {
  const { errorMessage, isHydrated } = useSettingsContext();

  return (
    <div>
      <span data-testid="hydrated">{String(isHydrated)}</span>
      <span>{errorMessage}</span>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ message: "Failed to load user settings." }, { status: 500 })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SettingsProvider", () => {
  it("does not overwrite user settings with defaults when hydration fails", async () => {
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("hydrated")).toHaveTextContent("true");
    });

    expect(
      screen.getByText(/Changes are disabled until settings reload succeeds/)
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/settings", { method: "GET" });
  });
});
