"use client";

import * as React from "react";
import {
  Folder,
  Code2,
  Terminal,
  MessagesSquare,
  User,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useMobileLayout,
  type MobileView,
} from "@/contexts/mobile-layout-context";
import { useOpenSettings } from "@/contexts/open-settings-context";

interface MobileToolbarProps {
  /** Title to display between navigation and account actions */
  title?: string;
  /** Callback to open the kernel connection dialog */
  onOpenKernelSelector?: () => void;
  /** Optional content to render on the right side (before Settings / Kernel) */
  rightContent?: React.ReactNode;
  className?: string;
}

const NAV_ITEMS: Array<{
  view: MobileView;
  label: string;
  icon: React.ReactNode;
}> = [
  { view: "chat", label: "Chat", icon: <MessagesSquare className="h-4 w-4" /> },
  {
    view: "left-sidebar",
    label: "Files",
    icon: <Folder className="h-4 w-4" />,
  },
  {
    view: "editor",
    label: "Editor",
    icon: <Code2 className="h-4 w-4" />,
  },
  {
    view: "terminal",
    label: "Terminal",
    icon: <Terminal className="h-4 w-4" />,
  },
];

/**
 * Top toolbar on mobile: primary view switches (chat, files, editor, terminal),
 * optional centered title, settings, and kernel connection.
 */
export function MobileToolbar({
  title,
  onOpenKernelSelector,
  rightContent,
  className,
}: MobileToolbarProps) {
  const { activeMobileView, setActiveMobileView } = useMobileLayout();
  const { openWithTab } = useOpenSettings();

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex h-12 items-center gap-1 border-b bg-sidebar px-1.5 shrink-0",
          className
        )}
      >
        <div className="flex shrink-0 items-center gap-0.5">
          {NAV_ITEMS.map((item) => (
            <Tooltip key={item.view}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={item.label}
                  aria-current={
                    activeMobileView === item.view ? "page" : undefined
                  }
                  className={cn(
                    "h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground",
                    activeMobileView === item.view &&
                      "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={() => setActiveMobileView(item.view)}
                >
                  {item.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {title ? (
          <span className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold">
            {title}
          </span>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          {rightContent}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Settings"
                onClick={() => openWithTab("providers")}
              >
                <User className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Settings</TooltipContent>
          </Tooltip>
          {onOpenKernelSelector ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Kernel selector"
                  onClick={() => onOpenKernelSelector()}
                >
                  <Cpu className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Kernel selector</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
