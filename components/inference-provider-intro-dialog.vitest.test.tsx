import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { InferenceProviderIntroDialog } from "@/components/inference-provider-intro-dialog";
import {
  SettingsProvider,
  useSettingsContext,
} from "@/components/settings/settings-provider";
import {
  OpenSettingsProvider,
  useOpenSettings,
} from "@/contexts/open-settings-context";
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
  const { initialTab, open } = useOpenSettings();
  return (
    <>
      <span data-testid="provider-chosen">
        {String(effectiveSettings.providers.inferenceProviderChosen)}
      </span>
      <span data-testid="settings-tab">{initialTab ?? "none"}</span>
      <span data-testid="settings-open">{String(open)}</span>
    </>
  );
}

beforeEach(() => {
  setUserSettingsDocumentMock.mockReset();
  setUserSettingsDocumentMock.mockResolvedValue(undefined);

  const defaultDocument = createDefaultUserSettingsDocument();
  defaultDocument.settings.onboarding.signInStepCompleted = true;
  defaultDocument.settings.appearance.experienceModeChosen = true;
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

describe("InferenceProviderIntroDialog", () => {
  it("lets a user cancel a pending ChatGPT browser sign-in", async () => {
    const popup = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      location: { assign: vi.fn() },
    };
    const openMock = vi
      .spyOn(window, "open")
      .mockReturnValue(popup as unknown as Window);
    const defaultDocument = createDefaultUserSettingsDocument();
    defaultDocument.settings.onboarding.signInStepCompleted = true;
    defaultDocument.settings.appearance.experienceModeChosen = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/settings") && (!init || init.method === "GET")) {
        return Response.json({ status: "missing", document: defaultDocument });
      }
      if (url.endsWith("/api/credentials")) {
        return Response.json({ credentials: {} });
      }
      if (url.endsWith("/api/credentials/oauth/browser/start")) {
        return Response.json({
          flowId: "test-flow",
          authorizationUrl: "https://auth.openai.test/authorize",
        });
      }
      if (url.endsWith("/api/credentials/oauth/browser/cancel")) {
        return new Response(null, { status: 204 });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SettingsProvider>
        <OpenSettingsProvider>
          <InferenceProviderIntroDialog />
        </OpenSettingsProvider>
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Connect an AI provider")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Log in with your ChatGPT account" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel sign-in" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel sign-in" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/credentials/oauth/browser/cancel",
        expect.objectContaining({
          body: JSON.stringify({ flowId: "test-flow" }),
          method: "POST",
        }),
      );
      expect(
        screen.getByRole("button", { name: "Log in with your ChatGPT account" }),
      ).toBeEnabled();
    });

    expect(popup.close).toHaveBeenCalledOnce();
    openMock.mockRestore();
  });

  it("returns to the workspace step from the upper-left back button", async () => {
    render(
      <SettingsProvider>
        <OpenSettingsProvider>
          <InferenceProviderIntroDialog />
        </OpenSettingsProvider>
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Connect an AI provider")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Back to workspace selection" }),
    );

    await waitFor(() => {
      expect(setUserSettingsDocumentMock).toHaveBeenCalled();
    });

    const savedDocument = setUserSettingsDocumentMock.mock.calls.at(-1)?.[0];
    expect(savedDocument.settings.appearance.experienceModeChosen).toBe(false);
  });

  it("opens Providers settings after the user chooses manual setup", async () => {
    render(
      <SettingsProvider>
        <OpenSettingsProvider>
          <InferenceProviderIntroDialog />
          <SettingsProbe />
        </OpenSettingsProvider>
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Connect an AI provider")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Set up manually in Settings" }),
    );

    await waitFor(() => {
      expect(setUserSettingsDocumentMock).toHaveBeenCalled();
    });

    const savedDocument = setUserSettingsDocumentMock.mock.calls.at(-1)?.[0];
    expect(savedDocument.settings.providers.inferenceProviderChosen).toBe(true);

    await waitFor(() => {
      expect(screen.getByTestId("settings-tab")).toHaveTextContent("providers");
      expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
      expect(screen.getByTestId("provider-chosen")).toHaveTextContent("true");
    });
  });
});
