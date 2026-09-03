import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentRunPowerManager,
  type PowerSaveBlockerAdapter,
} from "./agent-run-power-manager";

/** Creates a controllable Electron power blocker stand-in. */
function createPowerSaveBlocker(): PowerSaveBlockerAdapter & {
  isStarted: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  let started = false;
  return {
    isStarted: vi.fn(() => started),
    start: vi.fn(() => {
      started = true;
      return 42;
    }),
    stop: vi.fn(() => {
      started = false;
    }),
  };
}

describe("AgentRunPowerManager", () => {
  let blocker: ReturnType<typeof createPowerSaveBlocker>;

  beforeEach(() => {
    blocker = createPowerSaveBlocker();
  });

  it("prevents app suspension for an enabled active renderer on macOS", () => {
    const manager = new AgentRunPowerManager(blocker, "darwin");

    manager.setRendererState(1, {
      active: true,
      preventSystemSleep: true,
    });

    expect(blocker.start).toHaveBeenCalledWith("prevent-app-suspension");
  });

  it("does not assert power when the preference is disabled", () => {
    const manager = new AgentRunPowerManager(blocker, "darwin");

    manager.setRendererState(1, {
      active: true,
      preventSystemSleep: false,
    });

    expect(blocker.start).not.toHaveBeenCalled();
  });

  it("keeps the assertion until every active renderer finishes", () => {
    const manager = new AgentRunPowerManager(blocker, "darwin");

    manager.setRendererState(1, { active: true, preventSystemSleep: true });
    manager.setRendererState(2, { active: true, preventSystemSleep: true });
    manager.removeRenderer(1);

    expect(blocker.stop).not.toHaveBeenCalled();

    manager.setRendererState(2, {
      active: false,
      preventSystemSleep: true,
    });

    expect(blocker.stop).toHaveBeenCalledWith(42);
  });

  it("never asserts power outside macOS", () => {
    const manager = new AgentRunPowerManager(blocker, "win32");

    manager.setRendererState(1, { active: true, preventSystemSleep: true });

    expect(blocker.start).not.toHaveBeenCalled();
  });

  it("releases the assertion during disposal", () => {
    const manager = new AgentRunPowerManager(blocker, "darwin");
    manager.setRendererState(1, { active: true, preventSystemSleep: true });

    manager.dispose();

    expect(blocker.stop).toHaveBeenCalledWith(42);
  });
});
