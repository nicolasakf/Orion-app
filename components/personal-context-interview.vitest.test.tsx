import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { PersonalContextInterview } from "@/components/personal-context-interview";
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
  const document = createDefaultUserSettingsDocument();
  document.settings.onboarding.signInStepCompleted = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/settings") && (!init || init.method === "GET")) {
        return Response.json({ status: "missing", document });
      }
      if (url.endsWith("/api/credentials")) {
        return Response.json({ credentials: {} });
      }
      if (url.endsWith("/api/onboarding/interview")) {
        return Response.json({
          transcript: {
            version: 1,
            messages: [
              {
                id: "saved-question",
                role: "assistant",
                content: "Where does your sales data live?",
                createdAt: new Date().toISOString(),
              },
            ],
            updatedAt: new Date().toISOString(),
          },
        });
      }
      return Response.json({}, { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersonalContextInterview", () => {
  it("resumes the saved transcript and lets first-run users skip", async () => {
    render(
      <SettingsProvider>
        <PersonalContextInterview allowSkip />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Where does your sales data live?")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => {
      expect(setUserSettingsDocumentMock).toHaveBeenCalled();
    });
    const savedDocument = setUserSettingsDocumentMock.mock.calls.at(-1)?.[0];
    expect(savedDocument.settings.onboarding.businessProfileStepCompleted).toBe(true);
  });
});
