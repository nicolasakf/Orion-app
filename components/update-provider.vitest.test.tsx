import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    info: toastInfo,
    loading: vi.fn(() => "loading"),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { UpdateProvider, useOrionUpdate } from "./update-provider";

function UpdateProbe() {
  const { state, checkForUpdates } = useOrionUpdate();
  return (
    <button type="button" onClick={() => void checkForUpdates()}>
      {state.latestVersion ?? state.status}
    </button>
  );
}

describe("UpdateProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    toastInfo.mockClear();
    vi.useFakeTimers();
    delete window.orionDesktopUpdater;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("suppresses a dismissed release but toasts a newer release", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            supported: true,
            source: "npm",
            currentVersion: "0.10.1",
            latestVersion: "0.11.0",
            status: "available",
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            supported: true,
            source: "npm",
            currentVersion: "0.10.1",
            latestVersion: "0.11.0",
            status: "available",
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            supported: true,
            source: "npm",
            currentVersion: "0.10.1",
            latestVersion: "0.12.0",
            status: "available",
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UpdateProvider>
        <UpdateProbe />
      </UpdateProvider>
    );

    await act(async () => vi.advanceTimersByTimeAsync(4_000));
    expect(screen.getByText("0.11.0")).toBeInTheDocument();
    expect(toastInfo).toHaveBeenCalledTimes(1);
    const options = toastInfo.mock.calls[0]?.[1] as { onDismiss: () => void };
    act(() => options.onDismiss());

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
      await Promise.resolve();
    });
    expect(toastInfo).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
      await Promise.resolve();
    });
    expect(screen.getByText("0.12.0")).toBeInTheDocument();
    expect(toastInfo).toHaveBeenCalledTimes(2);
  });
});
