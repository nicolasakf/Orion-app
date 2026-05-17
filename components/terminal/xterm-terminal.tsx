"use client";

import { memo, useRef, useEffect } from "react";
import type { ITheme } from "@xterm/xterm";
import type { Terminal as JupyterTerminal } from "@jupyterlab/services";

/**
 * Reads sidebar background and foreground from the active document theme for xterm.
 * Sets `cursor` explicitly: xterm's default cursor is light and is invisible on light themes.
 * Cursor uses muted foreground so it reads as subtle vs body text.
 */
function getXtermThemeColorsFromDocument(): Pick<
  ITheme,
  "background" | "foreground" | "cursor" | "cursorAccent"
> {
  const computedStyle = getComputedStyle(document.documentElement);
  const bg =
    computedStyle.getPropertyValue("--sidebar-background").trim() || "#1e1e1e";
  const fg = computedStyle.getPropertyValue("--foreground").trim() || "#d4d4d4";
  const mutedFg =
    computedStyle.getPropertyValue("--muted-foreground").trim() || "0 0% 45.1%";
  const background = `hsl(${bg})`;
  const foreground = `hsl(${fg})`;
  return {
    background,
    foreground,
    cursor: `hsl(${mutedFg})`,
    cursorAccent: background,
  };
}

export interface XTermTerminalProps {
  /** The Jupyter terminal connection to bind to. */
  connection: JupyterTerminal.ITerminalConnection;
  /** Whether this terminal tab is currently visible. */
  isActive: boolean;
}

/**
 * xterm.js wrapper that binds to a Jupyter ITerminalConnection.
 *
 * Dynamically imports xterm to avoid SSR issues. Uses `display: none` when
 * inactive to preserve terminal state across tab switches.
 */
export const XTermTerminal = memo(function XTermTerminal({
  connection,
  isActive,
}: XTermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const initializedRef = useRef(false);

  // Initialize xterm.js on mount (dynamic import avoids SSR)
  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    let disposed = false;
    const cleanupFns: Array<() => void> = [];

    async function init() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      if (disposed || !containerRef.current) return;

      const themeColors = getXtermThemeColorsFromDocument();

      const xterm = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "monospace",
        theme: themeColors,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      xterm.open(containerRef.current);

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      // Fit and focus immediately
      try {
        fitAddon.fit();
      } catch {
        // Container may not be visible yet
      }
      xterm.focus();

      // Send initial size to the server
      connection.send({
        type: "set_size",
        content: [xterm.rows, xterm.cols],
      });

      // Pipe terminal output → xterm
      const messageReceivedHandler = (_sender: unknown, msg: JupyterTerminal.IMessage) => {
        if (msg.type === "stdout" && msg.content) {
          for (const chunk of msg.content) {
            xterm.write(String(chunk));
          }
        }
      };
      connection.messageReceived.connect(messageReceivedHandler);
      cleanupFns.push(() =>
        connection.messageReceived.disconnect(messageReceivedHandler)
      );

      // Pipe xterm input → terminal
      xterm.onData((data) => {
        connection.send({ type: "stdin", content: [data] });
      });

      // Notify server on resize
      xterm.onResize(({ rows, cols }) => {
        connection.send({
          type: "set_size",
          content: [rows, cols],
        });
      });

      // Auto-fit on container resize
      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore fit errors when container is hidden
        }
      });
      resizeObserver.observe(containerRef.current);
      cleanupFns.push(() => resizeObserver.disconnect());
    }

    init();

    return () => {
      disposed = true;
      cleanupFns.forEach((cleanup) => cleanup());
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      initializedRef.current = false;
    };
  }, [connection]);

  /**
   * Sync xterm colors when the theme class on `document.documentElement` changes.
   *
   * next-themes applies `class` (e.g. dark/light) in a parent useEffect; child
   * effects run first, so reading CSS variables in a theme-driven effect is
   * often one frame stale. Observing `class` on documentElement avoids that.
   */
  useEffect(() => {
    let raf = 0;

    const applyThemeFromCssVariables = () => {
      const xterm = xtermRef.current;
      if (!xterm) return;

      const next = getXtermThemeColorsFromDocument();
      xterm.options.theme = { ...xterm.options.theme, ...next };
      try {
        if (xterm.rows > 0) {
          xterm.refresh(0, xterm.rows - 1);
        }
      } catch {
        // Terminal may be mid-dispose
      }
    };

    const scheduleApply = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        applyThemeFromCssVariables();
      });
    };

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Re-fit and focus when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      // Small delay to ensure the container is visible and measured
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch {
          // Ignore
        }
        xtermRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        display: isActive ? "block" : "none",
        padding: "4px",
      }}
    />
  );
});
