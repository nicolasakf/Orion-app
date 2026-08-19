import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("keeps the user on required sign-in until they authenticate", async () => {
    render(
      <SettingsProvider>
        <OnboardingFlow />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Sign in to Orion")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
    expect(screen.queryByText("Welcome to Orion")).not.toBeInTheDocument();
  });

  it.each(["business", "pro"] as const)(
    "shows personal-context setup after provider setup in %s mode",
    async (experienceMode) => {
    const document = createDefaultUserSettingsDocument();
    document.settings.onboarding.signInStepCompleted = true;
    document.settings.appearance.experienceMode = experienceMode;
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
        if (url.endsWith("/api/onboarding/answers")) {
          return Response.json({
            answers: {
              version: 1,
              companyDescription: "",
              roleDescription: "",
              helpGoal: "",
            },
          });
        }
        if (url.endsWith("/api/onboarding/stack")) {
          return Response.json({
            selection: {
              version: 1,
              categories: {},
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
      // Every new user lands on the three questions before the tool picker.
      expect(screen.getByLabelText("What does your company do?")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    });
    },
  );
});
