"use client"

import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const resizableHandleVerticalStyles =
  "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90"

const ResizableHandle = ({
  withHandle,
  variant = "default",
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
  /** `sidebar`: invisible until the pointer is near the edge, then shows a resize guide line. */
  variant?: "default" | "sidebar"
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "relative flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      variant === "default" &&
        cn(
          "w-px bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
          resizableHandleVerticalStyles,
        ),
      variant === "sidebar" &&
        cn(
          "z-20 w-0 min-w-0 overflow-visible border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
          "after:pointer-events-none after:absolute after:top-4 after:bottom-4 after:left-1/2 after:hidden after:w-px after:-translate-x-1/2 after:bg-border after:content-['']",
          "data-[resize-handle-state=hover]:after:block",
        ),
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="corner-squircle z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
