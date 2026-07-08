import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { ExperienceModeIntroDialog } from "@/components/experience-mode-intro-dialog";
import {
  SettingsProvider,
  useSettingsContext,
} from "@/components/settings/settings-provider";
import { createDefaultUserSettingsDocument } from "@/lib/settings/defaults";

const setUserSettingsDocumentMock = vi.fn();

vi.mock("@/lib/settings/user-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings/user-storage")>();
  return {
    ...actual,
    setUserSettingsDocument: (...args: unknown[]) =>
      setUserSettingsDocumentMock(...args),
  };
});

function SettingsProbe() {
  const { effectiveSettings } = useSettingsContext();
  return (
    <span data-testid="experience-mode-chosen">
      {String(effectiveSettings.appearance.experienceModeChosen)}
    </span>
  );
}

beforeEach(() => {
  setUserSettingsDocumentMock.mockReset();
  setUserSettingsDocumentMock.mockResolvedValue(undefined);

  const defaultDocument = createDefaultUserSettingsDocument();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/settings") && (!init || init.method === "GET")) {
        return Response.json({
          status: "missing",
          document: defaultDocument,
        });
      }
      if (url.endsWith("/api/credentials")) {
        return Response.json({ credentials: {} });
      }
      return Response.json({}, { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExperienceModeIntroDialog", () => {
  it("shows on first launch and persists the selected experience mode", async () => {
    render(
      <SettingsProvider>
        <ExperienceModeIntroDialog />
        <SettingsProbe />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Welcome to Orion")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Pro" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(setUserSettingsDocumentMock).toHaveBeenCalled();
    });

    const savedDocument = setUserSettingsDocumentMock.mock.calls.at(-1)?.[0];
    expect(savedDocument.settings.appearance.experienceMode).toBe("pro");
    expect(savedDocument.settings.appearance.experienceModeChosen).toBe(true);

    await waitFor(() => {
      expect(screen.queryByText("Welcome to Orion")).not.toBeInTheDocument();
    });
  });
});
