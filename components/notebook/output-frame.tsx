import type { JSX, MouseEventHandler, ReactNode } from "react";

interface OutputFrameProps {
  children: ReactNode;
  /** Handles click events from the complete rendered output subtree. */
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
}

/**
 * Establishes the hard visual boundary for one rendered notebook output.
 * Paint containment also clips fixed-position descendants that would otherwise
 * use the application viewport as their containing block.
 */
export function OutputFrame({
  children,
  onClickCapture,
}: OutputFrameProps): JSX.Element {
  return (
    <div
      className="orion-output-frame relative isolate min-w-0 max-w-full overflow-hidden"
      data-orion-output-frame
      onClickCapture={onClickCapture}
      style={{ contain: "paint" }}
    >
      {children}
    </div>
  );
}
