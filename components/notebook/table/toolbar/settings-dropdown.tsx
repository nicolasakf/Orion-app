"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Settings } from "lucide-react";

import {
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  MIN_VISIBLE_ROWS,
  MAX_VISIBLE_ROWS,
} from "../constants";

interface SettingsDropdownProps {
  freezeHeader: boolean;
  setFreezeHeader: (frozen: boolean) => void;
  toolbarVisible: boolean;
  setToolbarVisible: (visible: boolean) => void;
  visibleRowCount: number;
  setVisibleRowCount: (count: number) => void;
  rowHeight: number;
  setRowHeight: (height: number) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  handleInputFocus: () => void;
  handleInputBlur: () => void;
}

/** Settings dropdown for table display options */
export function SettingsDropdown({
  freezeHeader,
  setFreezeHeader,
  toolbarVisible,
  setToolbarVisible,
  visibleRowCount,
  setVisibleRowCount,
  rowHeight,
  setRowHeight,
  fontSize,
  setFontSize,
  handleInputFocus,
  handleInputBlur,
}: SettingsDropdownProps) {
  return (
    <DropdownMenu>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="blink" size="xs">
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Table settings</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[300px]">
        <div className="p-2 space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="freeze-header"
              checked={freezeHeader}
              onCheckedChange={(checked) => setFreezeHeader(checked as boolean)}
            />
            <Label htmlFor="freeze-header">Freeze column header</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-toolbar"
              checked={toolbarVisible}
              onCheckedChange={(checked) =>
                setToolbarVisible(checked as boolean)
              }
            />
            <Label htmlFor="show-toolbar">Show toolbar</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Label htmlFor="visible-rows">Visible rows</Label>
            <Input
              id="visible-rows"
              type="number"
              min={MIN_VISIBLE_ROWS}
              max={MAX_VISIBLE_ROWS}
              value={visibleRowCount}
              onChange={(e) => setVisibleRowCount(Number(e.target.value))}
              className="w-auto"
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
            <span className="text-sm text-muted-foreground">rows</span>
          </div>

          <div className="flex items-center space-x-2">
            <Label htmlFor="row-height">Row height</Label>
            <Input
              id="row-height"
              type="number"
              min={MIN_ROW_HEIGHT}
              max={MAX_ROW_HEIGHT}
              value={rowHeight}
              onChange={(e) => setRowHeight(Number(e.target.value))}
              className="w-auto"
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
            <span className="text-sm text-muted-foreground">pixels</span>
          </div>

          <div className="flex items-center space-x-2">
            <Label htmlFor="font-size">Font size</Label>
            <Input
              id="font-size"
              type="number"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-auto"
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
            <span className="text-sm text-muted-foreground">pixels</span>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
