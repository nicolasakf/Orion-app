/** Minimal Electron power blocker surface used by the agent-run manager. */
export interface PowerSaveBlockerAdapter {
  isStarted: (id: number) => boolean;
  start: (type: "prevent-app-suspension") => number;
  stop: (id: number) => void;
}

export interface AgentRunPowerState {
  active: boolean;
  preventSystemSleep: boolean;
}

/**
 * Owns the macOS power assertion used while an agent turn is active.
 *
 * Renderer state is tracked separately so one idle Orion window cannot release
 * the assertion while an agent is still working in another window.
 */
export class AgentRunPowerManager {
  private readonly rendererStates = new Map<number, AgentRunPowerState>();
  private blockerId: number | null = null;

  constructor(
    private readonly blocker: PowerSaveBlockerAdapter,
    private readonly platform: NodeJS.Platform = process.platform
  ) {}

  /** Records the latest power preference and activity state for one renderer. */
  setRendererState(rendererId: number, state: AgentRunPowerState): void {
    if (state.active && state.preventSystemSleep) {
      this.rendererStates.set(rendererId, state);
    } else {
      this.rendererStates.delete(rendererId);
    }
    this.syncPowerAssertion();
  }

  /** Removes stale activity when a renderer navigates, crashes, or closes. */
  removeRenderer(rendererId: number): void {
    this.rendererStates.delete(rendererId);
    this.syncPowerAssertion();
  }

  /** Releases the assertion and clears renderer activity during app shutdown. */
  dispose(): void {
    this.rendererStates.clear();
    this.stopPowerAssertion();
  }

  /** Matches the power assertion to aggregate renderer activity. */
  private syncPowerAssertion(): void {
    if (this.platform !== "darwin") {
      this.stopPowerAssertion();
      return;
    }

    if (this.rendererStates.size > 0) {
      if (this.blockerId === null || !this.blocker.isStarted(this.blockerId)) {
        this.blockerId = this.blocker.start("prevent-app-suspension");
      }
      return;
    }

    this.stopPowerAssertion();
  }

  /** Stops the current assertion when Electron still considers it active. */
  private stopPowerAssertion(): void {
    if (this.blockerId === null) return;
    if (this.blocker.isStarted(this.blockerId)) {
      this.blocker.stop(this.blockerId);
    }
    this.blockerId = null;
  }
}
