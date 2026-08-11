import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE } from "@/lib/cloud/oauth";

import { CloudAuthDialog } from "./cloud-auth-dialog";

const mocks = vi.hoisted(() => {
  const signInWithOAuth = vi.fn();
  const exchangeCodeForSession = vi.fn();
  const getOrionCloudConfig = vi.fn();
  const toastSuccess = vi.fn();
  const popupWindow = {
    close: vi.fn(),
    location: { href: "" },
  };
  const toastError = vi.fn();

  return {
    exchangeCodeForSession,
    getOrionCloudConfig,
    signInWithOAuth,
    toastError,
    toastSuccess,
    popupWindow,
    supabaseClient: {
      auth: {
        exchangeCodeForSession,
        signInWithOAuth,
      },
    },
  };
});

vi.mock("@/lib/cloud/config", () => ({
  getOrionCloudConfig: mocks.getOrionCloudConfig,
}));

vi.mock("@/lib/cloud/supabase-client", () => ({
  createOrionCloudSupabaseClient: () => mocks.supabaseClient,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

describe("CloudAuthDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrionCloudConfig.mockReturnValue({
      apiBaseUrl: "https://app.orion-agent.ai",
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
    });
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: "https://example.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.popupWindow.close.mockClear();
    mocks.popupWindow.location.href = "";
    vi.spyOn(window, "open").mockReturnValue(mocks.popupWindow as unknown as Window);
  });

  it("starts Google OAuth without redirecting the local app", async () => {
    render(<CloudAuthDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: expect.stringContaining(
          "https://app.orion-agent.ai/cloud/oauth/callback",
        ),
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    const redirectTo = mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo;
    const redirectUrl = new URL(redirectTo);
    expect(redirectUrl.origin).toBe("https://app.orion-agent.ai");
    expect(redirectUrl.pathname).toBe("/cloud/oauth/callback");
    expect(redirectUrl.searchParams.get("orion_origin")).toBe(window.location.origin);
    expect(redirectUrl.searchParams.get("orion_state")).toBeTruthy();
    expect(window.open).toHaveBeenCalledWith(
      "about:blank",
      "orion-cloud-google-oauth",
      "popup=yes,width=520,height=720",
    );
    expect(mocks.popupWindow.location.href).toBe(
      "https://example.supabase.co/auth/v1/authorize?provider=google",
    );
  });

  it("exchanges a matching relay code for a local Supabase session", async () => {
    const onAuthenticated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CloudAuthDialog
        open
        onOpenChange={onOpenChange}
        onAuthenticated={onAuthenticated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1));

    const redirectTo = mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo;
    const state = new URL(redirectTo).searchParams.get("orion_state");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
          state,
          code: "auth-code",
        },
      }),
    );

    await waitFor(() =>
      expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("auth-code"),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("ignores mismatched relay state", async () => {
    render(<CloudAuthDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1));

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
          state: "wrong-state",
          code: "auth-code",
        },
      }),
    );

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("does not exchange a relay error", async () => {
    render(<CloudAuthDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1));

    const redirectTo = mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo;
    const state = new URL(redirectTo).searchParams.get("orion_state");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: ORION_CLOUD_GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
          state,
          error: "access_denied",
        },
      }),
    );

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(await screen.findByText("access_denied.")).toBeInTheDocument();
  });
});
