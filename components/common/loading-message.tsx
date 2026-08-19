"use client";

import * as React from "react";

import { useOrionSettings } from "@/hooks/use-orion-settings";

interface LoadingMessageProps {
  className?: string;
  /** Overrides the global chat font size for the loading indicator. */
  fontSize?: number;
}

export function LoadingMessage({ className, fontSize }: LoadingMessageProps) {
  const { effectiveSettings } = useOrionSettings();
  const chatFontSize = fontSize ?? effectiveSettings.chat.fontSize;
  return (
    <div className="flex justify-start">
      <div
        className={`corner-squircle max-w-[80%] p-3 rounded-lg bg-accent ${className ?? ""}`}
        style={{ fontSize: chatFontSize }}
      >
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center gap-0.5"
            style={
              {
                "--dot-color": "hsl(var(--muted-foreground))",
                "--animation-duration": "1.4s",
              } as React.CSSProperties
            } // Cast to React.CSSProperties
          >
            {[0.32, 0.16, 0].map((delay, i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-[--dot-color]"
                style={{
                  animation: `typing var(--animation-duration) infinite ease-in-out`,
                  animationDelay: `-${delay}s`,
                }}
              ></span>
            ))}
          </div>
          <style jsx>{`
            @keyframes typing {
              0%,
              80%,
              100% {
                opacity: 0.3;
                transform: scale(0.8);
              }
              40% {
                opacity: 1;
                transform: scale(1);
              }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
