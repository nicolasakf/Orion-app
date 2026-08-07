import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { OnboardingFlow } from "@/components/onboarding-flow";
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

describe("OnboardingFlow", () => {
  it("uses a modal dialog that hides background controls", async () => {
    render(
      <>
        <button type="button">Background action</button>
        <SettingsProvider>
          <OnboardingFlow />
        </SettingsProvider>
      </>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Sign in to Orion" }),
      ).toHaveAttribute("data-state", "open");
    });

    expect(
      screen.queryByRole("button", { name: "Background action" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Background action", hidden: true }),
    ).toBeInTheDocument();
  });

  it("replaces the sign-in dialog with workspace selection after skipping", async () => {
    render(
      <SettingsProvider>
        <OnboardingFlow />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Sign in to Orion")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => {
      expect(screen.getByText("Welcome to Orion")).toBeInTheDocument();
      expect(screen.queryByText("Sign in to Orion")).not.toBeInTheDocument();
    });
  });

  it("shows the interview after provider setup for an eligible Business user", async () => {
    const document = createDefaultUserSettingsDocument();
    document.settings.onboarding.signInStepCompleted = true;
    document.settings.appearance.experienceMode = "business";
    document.settings.appearance.experienceModeChosen = true;
    document.settings.providers.inferenceProviderChosen = true;
    document.settings.onboarding.businessProfileStepCompleted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/settings") && (!init || init.method === "GET")) {
          return Response.json({ status: "loaded", document });
        }
        if (url.endsWith("/api/credentials")) {
          return Response.json({ credentials: {} });
        }
        if (url.endsWith("/api/onboarding/interview")) {
          return Response.json({
            transcript: {
              version: 1,
              messages: [],
              updatedAt: new Date(0).toISOString(),
            },
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );

    render(
      <SettingsProvider>
        <OnboardingFlow />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Help Orion understand your work")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    });
  });
});
