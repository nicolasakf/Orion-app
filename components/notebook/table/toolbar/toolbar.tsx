"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ListFilter,
  RotateCcw,
  Copy,
  FileSpreadsheet,
  Maximize2,
  Plus,
  CircleHelpIcon,
  X,
} from "lucide-react";

import type { DataTableProps, TableView } from "../types";
import { ColumnManager } from "./column-manager";
import { SettingsDropdown } from "./settings-dropdown";

interface ToolbarProps {
  searchTerm: string;
  handleSearch: (term: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  handleInputFocus: () => void;
  handleInputBlur: () => void;
  setFullscreenMode: (mode: boolean) => void;
  resetAll: () => void;
  data: DataTableProps["data"];
  visibleColumns: string[];
  setVisibleColumns: React.Dispatch<React.SetStateAction<string[]>>;
  handleColumnSelect: (colName: string, e?: React.MouseEvent) => void;
  handleColumnVisibilityChange: (column: string, isVisible: boolean) => void;
  copyToClipboard: () => void;
  exportToExcel: () => void;
  isViewDialogOpen: boolean;
  setIsViewDialogOpen: (open: boolean) => void;
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
  views: TableView[];
  activeView: string | null;
  applyView: (viewId: string) => void;
  resetToDefault: () => void;
  deleteView: (viewId: string) => void;
  setShowShortcutsDialog: (show: boolean) => void;
}

/** Main toolbar with search, view tabs, and action buttons */
export function Toolbar({
  searchTerm,
  handleSearch,
  searchInputRef,
  handleInputFocus,
  handleInputBlur,
  setFullscreenMode,
  resetAll,
  data,
  visibleColumns,
  setVisibleColumns,
  handleColumnSelect,
  handleColumnVisibilityChange,
  copyToClipboard,
  exportToExcel,
  isViewDialogOpen,
  setIsViewDialogOpen,
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
  views,
  activeView,
  applyView,
  resetToDefault,
  deleteView,
  setShowShortcutsDialog,
}: ToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <div className="flex items-center gap-2 flex-grow">
        <div className="relative w-full sm:w-64">
          <div className="flex ml-2 items-center border-0 border-b-[1px] focus:border-primary transition-colors duration-200 rounded-none">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search all columns..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-8 px-1 border-none bg-transparent"
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
          </div>
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full aspect-square p-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
              onClick={() => handleSearch("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {views.length > 0 && (
          <Tabs value={activeView || "default"} className="w-auto">
            <TabsList className="h-8">
              <TabsTrigger
                value="default"
                className="text-xs py-1 px-2"
                onClick={resetToDefault}
              >
                Default
              </TabsTrigger>
              {views.map((view) => (
                <TabsTrigger
                  key={view.id}
                  value={view.id}
                  className="text-xs py-1 px-2 group relative"
                  onClick={() => applyView(view.id)}
                >
                  {view.name}
                  <button
                    className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteView(view.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="blink"
              size="xs"
              onClick={() => setIsViewDialogOpen(true)}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Create new view</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-wrap gap-3 mr-1">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="blink"
              size="xs"
              onClick={() => setShowShortcutsDialog(true)}
            >
              <CircleHelpIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Keyboard shortcuts</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="blink"
              size="xs"
              onClick={() => setFullscreenMode(true)}
            >
              <Maximize2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Enter fullscreen mode</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button variant="blink" size="xs" onClick={resetAll}>
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Reset table</p>
          </TooltipContent>
        </Tooltip>

        <ColumnManager
          headers={data.headers}
          visibleColumns={visibleColumns}
          setVisibleColumns={setVisibleColumns}
          handleColumnSelect={handleColumnSelect}
          onVisibilityChange={handleColumnVisibilityChange}
        />

        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button variant="blink" size="xs" onClick={copyToClipboard}>
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Copy to clipboard</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button variant="blink" size="xs" onClick={exportToExcel}>
              <FileSpreadsheet />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Export to Excel</p>
          </TooltipContent>
        </Tooltip>
        <SettingsDropdown
          freezeHeader={freezeHeader}
          setFreezeHeader={setFreezeHeader}
          toolbarVisible={toolbarVisible}
          setToolbarVisible={setToolbarVisible}
          visibleRowCount={visibleRowCount}
          setVisibleRowCount={setVisibleRowCount}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          fontSize={fontSize}
          setFontSize={setFontSize}
          handleInputFocus={handleInputFocus}
          handleInputBlur={handleInputBlur}
        />
      </div>
    </div>
  );
}
