/**
 * Client-side alerts when a full agent turn finishes (chime + background notification).
 */

export interface AgentRunCompleteAlertOptions {
  /** When true, play the completion chime. */
  playSound: boolean;
  /** When true, show an OS/browser notification if Orion is in the background. */
  notify: boolean;
  /** Notification title (defaults to "Orion"). */
  title?: string;
  /** Notification body (defaults to "Agent finished"). */
  body?: string;
}

export interface AgentRunCompleteAlertSettings {
  playSoundOnAgentFinish: boolean;
  notifyOnAgentFinish: boolean;
}

let audioContext: AudioContext | null = null;

/** Returns true when running inside the Electron desktop shell. */
export function isDesktopShell(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(window.orionDesktopShell || window.orionDesktopUpdater);
}

/**
 * Unlocks Web Audio on a user gesture so a chime can play after a long agent run.
 * Safe to call repeatedly.
 */
export function unlockAgentCompleteAudio(): void {
  if (typeof window === "undefined" || !window.AudioContext) {
    return;
  }

  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
  } catch {
    // Autoplay policies vary; chime will fail silently later.
  }
}

/**
 * Returns true when Orion is not in the foreground (hidden tab or unfocused window).
 */
export async function isOrionInBackground(): Promise<boolean> {
  if (typeof document === "undefined") {
    return false;
  }

  if (document.hidden) {
    return true;
  }

  if (isDesktopShell() && window.orionDesktopShell?.isWindowFocused) {
    try {
      const focused = await window.orionDesktopShell.isWindowFocused();
      return !focused;
    } catch {
      return !document.hasFocus();
    }
  }

  return !document.hasFocus();
}

/** Plays a short two-tone chime via Web Audio. Fails silently when blocked. */
export function playAgentCompleteChime(): void {
  if (typeof window === "undefined" || !window.AudioContext) {
    return;
  }

  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    const ctx = audioContext;
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => playChime(ctx)).catch(() => {});
      return;
    }
    playChime(ctx);
  } catch {
    // Ignore autoplay or hardware errors.
  }
}

function playChime(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const tones: Array<{ frequency: number; start: number; duration: number }> = [
    { frequency: 880, start: 0, duration: 0.12 },
    { frequency: 1174.66, start: 0.14, duration: 0.18 },
  ];

  for (const tone of tones) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = tone.frequency;
    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const start = now + tone.start;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);

    oscillator.start(start);
    oscillator.stop(start + tone.duration + 0.02);
  }
}

/** Requests browser notification permission (web only). Returns the permission state. */
export async function requestAgentCompleteNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || isDesktopShell()) {
    return "granted";
  }
  if (!("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Shows a completion notification via Electron IPC or the browser Notification API. */
export async function showAgentCompleteNotification(options: {
  title: string;
  body: string;
}): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (isDesktopShell() && window.orionDesktopShell?.showNotification) {
    try {
      await window.orionDesktopShell.showNotification(options);
    } catch {
      // Desktop notification failed; no fallback to renderer API.
    }
    return;
  }

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      silent: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Permission revoked or platform blocked.
  }
}

/**
 * Returns true when a completion alert should fire for this turn end.
 * Skips user-cancelled runs and turns that hand off to a queued message.
 */
export function shouldAlertOnAgentTurnComplete(options: {
  wasActive: boolean;
  isActive: boolean;
  userStopped: boolean;
  queuedMessageCount: number;
}): boolean {
  if (!options.wasActive || options.isActive) {
    return false;
  }
  if (options.userStopped) {
    return false;
  }
  if (options.queuedMessageCount > 0) {
    return false;
  }
  return true;
}

/**
 * Plays chime and/or shows a background notification when a full agent turn completes.
 */
export async function alertAgentRunComplete(
  options: AgentRunCompleteAlertOptions
): Promise<void> {
  if (options.playSound) {
    playAgentCompleteChime();
  }

  if (!options.notify) {
    return;
  }

  const inBackground = await isOrionInBackground();
  if (!inBackground) {
    return;
  }

  await showAgentCompleteNotification({
    title: options.title ?? "Orion",
    body: options.body ?? "Agent finished",
  });
}
