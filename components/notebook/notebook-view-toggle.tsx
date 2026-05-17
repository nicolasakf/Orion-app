"use client";

import { BookOpen, LayoutTemplate } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNotebookViewMode } from "@/contexts/notebook-view-mode-context";

/**
 * Notebook / App view switcher for the editor toolbar. Reads from
 * {@link NotebookViewModeProvider} so the rest of the page shell does not
 * subscribe to view mode updates.
 */
export function NotebookViewToggle() {
  const { notebookViewMode, setNotebookViewMode } = useNotebookViewMode();

  return (
    <TooltipProvider delayDuration={300}>
      <ToggleGroup
        type="single"
        value={notebookViewMode}
        onValueChange={(value) => {
          if (value === "notebook" || value === "app") {
            setNotebookViewMode(value);
          }
        }}
        className="corner-squircle rounded-md border border-border/50 bg-transparent p-0.5"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="notebook"
              aria-label="Notebook view"
              className="corner-squircle h-7 w-7 min-w-7 rounded-md border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-muted/50 hover:text-foreground aria-checked:!bg-muted aria-checked:!text-foreground aria-checked:hover:!bg-muted"
            >
              <BookOpen className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <p>Notebook view</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="app"
              aria-label="App view"
              className="corner-squircle h-7 w-7 min-w-7 rounded-md border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-muted/50 hover:text-foreground aria-checked:!bg-muted aria-checked:!text-foreground aria-checked:hover:!bg-muted"
            >
              <LayoutTemplate className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <p>App view</p>
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  );
}
