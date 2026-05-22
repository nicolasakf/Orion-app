"use client";

import { Code2, Eye } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMarkdownEditorViewMode } from "@/contexts/markdown-editor-view-mode-context";

/** Toolbar controls that switch Markdown between source editing and preview. */
export function MarkdownEditorToolbar() {
  const { markdownEditorViewMode, setMarkdownEditorViewMode } =
    useMarkdownEditorViewMode();

  return (
    <TooltipProvider delayDuration={300}>
      <ToggleGroup
        type="single"
        value={markdownEditorViewMode}
        onValueChange={(value) => {
          if (value === "edit" || value === "preview") {
            setMarkdownEditorViewMode(value);
          }
        }}
        className="corner-squircle rounded-md border border-border/50 bg-transparent p-0.5"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="edit"
              aria-label="Edit Markdown"
              className="corner-squircle h-7 w-7 min-w-7 rounded-md border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-muted/50 hover:text-foreground aria-checked:!bg-muted aria-checked:!text-foreground aria-checked:hover:!bg-muted"
            >
              <Code2 className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edit Markdown</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="preview"
              aria-label="Preview Markdown"
              className="corner-squircle h-7 w-7 min-w-7 rounded-md border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-muted/50 hover:text-foreground aria-checked:!bg-muted aria-checked:!text-foreground aria-checked:hover:!bg-muted"
            >
              <Eye className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <p>Preview Markdown</p>
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  );
}
