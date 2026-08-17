import type { JSX, MouseEventHandler, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface OutputFrameProps {
  children: ReactNode;
  /** Handles click events from the complete rendered output subtree. */
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
  /** Sizes the boundary to its rendered output instead of its parent column. */
  fitContent?: boolean;
}

/**
 * Establishes the hard visual boundary for one rendered notebook output.
 * Paint containment also clips fixed-position descendants that would otherwise
 * use the application viewport as their containing block.
 */
export function OutputFrame({
  children,
  onClickCapture,
  fitContent = false,
}: OutputFrameProps): JSX.Element {
  return (
    <div
      className={cn(
        "orion-output-frame relative isolate overflow-hidden",
        fitContent ? "w-max max-w-none" : "min-w-0 max-w-full",
      )}
      data-orion-output-frame
      onClickCapture={onClickCapture}
      style={{ contain: "paint" }}
    >
      {children}
    </div>
  );
}
