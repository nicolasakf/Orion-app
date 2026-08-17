import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  alertAgentRunComplete,
  isDesktopShell,
  isOrionInBackground,
  requestAgentCompleteNotificationPermission,
  shouldAlertOnAgentTurnComplete,
  showAgentCompleteNotification,
} from "@/lib/notifications/agent-run-complete";

describe("shouldAlertOnAgentTurnComplete", () => {
  it("fires when a turn ends without stop or queued follow-up", () => {
    expect(
      shouldAlertOnAgentTurnComplete({
        wasActive: true,
        isActive: false,
        userStopped: false,
        queuedMessageCount: 0,
      })
    ).toBe(true);
  });

  it("skips when the turn was not active", () => {
    expect(
      shouldAlertOnAgentTurnComplete({
        wasActive: false,
        isActive: false,
        userStopped: false,
        queuedMessageCount: 0,
      })
    ).toBe(false);
  });

  it("skips when the turn is still active", () => {
    expect(
      shouldAlertOnAgentTurnComplete({
        wasActive: true,
        isActive: true,
        userStopped: false,
        queuedMessageCount: 0,
      })
    ).toBe(false);
  });

  it("skips when the user stopped generation", () => {
    expect(
      shouldAlertOnAgentTurnComplete({
        wasActive: true,
        isActive: false,
        userStopped: true,
        queuedMessageCount: 0,
      })
    ).toBe(false);
  });

  it("skips when a queued message will send next", () => {
    expect(
      shouldAlertOnAgentTurnComplete({
        wasActive: true,
        isActive: false,
        userStopped: false,
        queuedMessageCount: 1,
      })
    ).toBe(false);
  });
});

describe("isOrionInBackground", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      hidden: false,
      hasFocus: () => true,
    });
    delete (window as Window).orionDesktopShell;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when the document is hidden", async () => {
    vi.stubGlobal("document", {
      hidden: true,
      hasFocus: () => true,
    });
    await expect(isOrionInBackground()).resolves.toBe(true);
  });

  it("returns true when the desktop window is not focused", async () => {
    (window as Window).orionDesktopShell = {
      isWindowFocused: vi.fn().mockResolvedValue(false),
    } as unknown as Window["orionDesktopShell"];
    await expect(isOrionInBackground()).resolves.toBe(true);
  });

  it("returns false when the desktop window is focused", async () => {
    (window as Window).orionDesktopShell = {
      isWindowFocused: vi.fn().mockResolvedValue(true),
    } as unknown as Window["orionDesktopShell"];
    await expect(isOrionInBackground()).resolves.toBe(false);
  });
});

describe("showAgentCompleteNotification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window).orionDesktopShell;
  });

  it("uses the desktop shell bridge when available", async () => {
    const showNotification = vi.fn().mockResolvedValue(true);
    (window as Window).orionDesktopShell = {
      showNotification,
    } as unknown as Window["orionDesktopShell"];

    await showAgentCompleteNotification({ title: "Orion", body: "Agent finished" });

    expect(showNotification).toHaveBeenCalledWith({
      title: "Orion",
      body: "Agent finished",
    });
  });

  it("uses the browser Notification API on web when permission is granted", async () => {
    const notificationClose = vi.fn();
    const NotificationMock = vi.fn().mockImplementation(() => ({
      close: notificationClose,
    }));
    Object.assign(NotificationMock, { permission: "granted" });
    vi.stubGlobal("Notification", NotificationMock);

    await showAgentCompleteNotification({ title: "Orion", body: "Done" });

    expect(NotificationMock).toHaveBeenCalledWith("Orion", {
      body: "Done",
      silent: true,
    });
  });
});

describe("alertAgentRunComplete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window).orionDesktopShell;
  });

  it("plays sound without notifying when focused", async () => {
    vi.stubGlobal("document", {
      hidden: false,
      hasFocus: () => true,
    });
    const showNotification = vi.fn();
    (window as Window).orionDesktopShell = {
      showNotification,
    } as unknown as Window["orionDesktopShell"];

    await alertAgentRunComplete({
      playSound: true,
      notify: true,
      title: "Orion",
      body: "Agent finished",
    });

    expect(showNotification).not.toHaveBeenCalled();
  });

  it("skips sound and notification when both settings are off", async () => {
    vi.stubGlobal("document", {
      hidden: true,
      hasFocus: () => false,
    });
    const showNotification = vi.fn();
    (window as Window).orionDesktopShell = {
      showNotification,
    } as unknown as Window["orionDesktopShell"];

    await alertAgentRunComplete({
      playSound: false,
      notify: false,
    });

    expect(showNotification).not.toHaveBeenCalled();
  });
});

describe("requestAgentCompleteNotificationPermission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window).orionDesktopShell;
  });

  it("returns granted on desktop without prompting", async () => {
    (window as Window).orionDesktopShell = {} as unknown as Window["orionDesktopShell"];
    await expect(requestAgentCompleteNotificationPermission()).resolves.toBe("granted");
  });
});

describe("isDesktopShell", () => {
  afterEach(() => {
    delete (window as Window).orionDesktopShell;
    delete (window as Window).orionDesktopUpdater;
  });

  it("detects the desktop shell bridge", () => {
    (window as Window).orionDesktopShell = {} as unknown as Window["orionDesktopShell"];
    expect(isDesktopShell()).toBe(true);
  });
});
