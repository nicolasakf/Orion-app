"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SlidersHorizontal } from "lucide-react";

interface ColumnManagerProps {
  headers: string[];
  visibleColumns: string[];
  setVisibleColumns: React.Dispatch<React.SetStateAction<string[]>>;
  handleColumnSelect: (colName: string, e?: React.MouseEvent) => void;
  onVisibilityChange: (column: string, isVisible: boolean) => void;
}

/** Dropdown for toggling column visibility and reordering via drag */
export function ColumnManager({
  headers,
  visibleColumns,
  setVisibleColumns,
  handleColumnSelect,
  onVisibilityChange,
}: ColumnManagerProps) {
  return (
    <DropdownMenu>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="blink" size="xs">
              <SlidersHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Manage columns</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[200px]">
        {headers
          .sort((a, b) => {
            const aIndex = visibleColumns.indexOf(a);
            const bIndex = visibleColumns.indexOf(b);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return headers.indexOf(a) - headers.indexOf(b);
          })
          .map((header) => (
            <div key={header} className="flex items-center p-2">
              <div
                className="cursor-grab active:cursor-grabbing p-1 mr-1"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/plain", header)
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedHeader = e.dataTransfer.getData("text/plain");
                  if (draggedHeader && draggedHeader !== header) {
                    const newColumns = [...visibleColumns];
                    const fromIndex = newColumns.indexOf(draggedHeader);
                    const toIndex = newColumns.indexOf(header);
                    if (fromIndex !== -1 && toIndex !== -1) {
                      newColumns.splice(fromIndex, 1);
                      newColumns.splice(toIndex, 0, draggedHeader);
                      setVisibleColumns(newColumns);
                    }
                  }
                }}
                onClick={() => handleColumnSelect(header)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                >
                  <circle cx="9" cy="5" r="1" />
                  <circle cx="9" cy="12" r="1" />
                  <circle cx="9" cy="19" r="1" />
                  <circle cx="15" cy="5" r="1" />
                  <circle cx="15" cy="12" r="1" />
                  <circle cx="15" cy="19" r="1" />
                </svg>
              </div>
              <Checkbox
                id={`column-${header}`}
                checked={visibleColumns.includes(header)}
                onCheckedChange={(checked) =>
                  onVisibilityChange(header, checked as boolean)
                }
              />
              <Label htmlFor={`column-${header}`} className="ml-2">
                {header}
              </Label>
            </div>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
