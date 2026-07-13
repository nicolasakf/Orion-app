import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { SignInIntroDialog } from "@/components/sign-in-intro-dialog";
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
    <span data-testid="sign-in-completed">
      {String(effectiveSettings.onboarding.signInStepCompleted)}
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
        return Response.json({ status: "missing", document: defaultDocument });
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

describe("SignInIntroDialog", () => {
  it("lets a user skip sign-in and advances the onboarding state", async () => {
    render(
      <SettingsProvider>
        <SignInIntroDialog />
        <SettingsProbe />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Sign in to Orion")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => {
      expect(setUserSettingsDocumentMock).toHaveBeenCalled();
      expect(screen.getByTestId("sign-in-completed")).toHaveTextContent("true");
    });
  });
});
