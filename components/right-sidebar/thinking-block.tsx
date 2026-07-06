"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  /** The reasoning text (grows during streaming) */
  reasoning: string;
  /** Whether reasoning is still being generated */
  isStreaming: boolean;
}

/**
 * Collapsible thinking block that displays model reasoning tokens.
 * Shows an animated "Thinking" label while streaming, then transitions
 * to "Thought for Xm Ys" once reasoning completes.
 */
export function ThinkingBlock({ reasoning, isStreaming }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  /** Once a block finishes streaming, keep the completed label even if parent props flicker. */
  const [hasFinishedStreaming, setHasFinishedStreaming] = useState(!isStreaming);
  const showAsStreaming = isStreaming && !hasFinishedStreaming;

  useEffect(() => {
    if (!showAsStreaming) return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [showAsStreaming]);

  // Capture final elapsed time when streaming stops
  useEffect(() => {
    if (isStreaming) return;

    setHasFinishedStreaming(true);
    setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
  }, [isStreaming]);

  /** Format seconds into "Xm Ys" or "Xs" */
  function formatDuration(seconds: number): string {
    if (seconds < 1) return "briefly";
    if (seconds < 60) return `for ${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `for ${m}m ${s}s`;
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />
        {showAsStreaming ? (
          <span className="animate-pulse">Thinking</span>
        ) : (
          <span>Thought {formatDuration(elapsedSeconds)}</span>
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 ml-4.5 pl-3 border-l border-muted text-xs text-muted-foreground/70 whitespace-pre-wrap">
          {reasoning}
        </div>
      )}
    </div>
  );
}
