import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { SignInIntroDialog } from "@/components/sign-in-intro-dialog";
import { SettingsProvider } from "@/components/settings/settings-provider";
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
  it("does not offer a way to skip the required sign-in step", async () => {
    render(
      <SettingsProvider>
        <SignInIntroDialog />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Sign in to Orion")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
    expect(setUserSettingsDocumentMock).not.toHaveBeenCalled();
  });
});
