"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface ChatSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Additional classes for the reusable chat container. */
  className?: string;
}

/** Shared chat container used by sidebar and alternate chat-first shells. */
export const ChatSurface = React.forwardRef<HTMLDivElement, ChatSurfaceProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-full w-full min-w-0 flex-col overflow-hidden bg-sidebar",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);

ChatSurface.displayName = "ChatSurface";
