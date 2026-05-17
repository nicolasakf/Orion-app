"use client";

import { useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListFilter, X } from "lucide-react";
import { cn } from "@/lib/utils";

import type { AdvancedFilter, AdvancedFilterConfig, FilterOperation } from "./types";

interface FilterPopoverProps {
  header: string;
  activeFilterColumn: string | null;
  setActiveFilterColumn: (column: string | null) => void;
  hasColumnFilters: (column: string) => boolean;
  applyFilterToAllColumns: (column: string) => void;
  clearColumnFilters: (column: string) => void;
  pendingFilters: Record<string, AdvancedFilter[]>;
  setPendingFilters: React.Dispatch<
    React.SetStateAction<Record<string, AdvancedFilter[]>>
  >;
  pendingFilterLogic: Record<string, "AND" | "OR">;
  setPendingFilterLogic: React.Dispatch<
    React.SetStateAction<Record<string, "AND" | "OR">>
  >;
  applyPendingFilters: (column: string) => void;
  initPendingFilters: (column: string) => void;
  handleInputFocus: () => void;
  handleInputBlur: () => void;
  advancedFilterConfig: AdvancedFilterConfig;
}

/**
 * Advanced filter popover for a table column.
 * Bug fix: initializes pending filters via useEffect instead of during render.
 */
export function FilterPopover({
  header,
  activeFilterColumn,
  setActiveFilterColumn,
  hasColumnFilters,
  applyFilterToAllColumns,
  clearColumnFilters,
  pendingFilters,
  setPendingFilters,
  pendingFilterLogic,
  setPendingFilterLogic,
  applyPendingFilters,
  initPendingFilters,
  handleInputFocus,
  handleInputBlur,
  advancedFilterConfig,
}: FilterPopoverProps) {
  const isOpen = activeFilterColumn === header;

  // Bug fix: moved from render-time IIFE to useEffect
  useEffect(() => {
    if (isOpen) {
      initPendingFilters(header);
    }
  }, [isOpen, header, initPendingFilters]);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => setActiveFilterColumn(open ? header : null)}
    >
      <PopoverTrigger asChild>
        <Button
          variant="blink"
          size="xs"
          className={cn(hasColumnFilters(header) ? "text-blue-500" : "")}
        >
          <ListFilter className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Filter: {header}</h4>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => applyFilterToAllColumns(header)}
              >
                Apply to all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => clearColumnFilters(header)}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {pendingFilters[header]?.map(
              (filter: AdvancedFilter, index: number) => (
                <div key={filter.id} className="flex gap-2 items-center">
                  <Input
                    placeholder="Filter value..."
                    className="h-8"
                    value={filter.value}
                    onChange={(e) => {
                      const newFilters = [...pendingFilters[header]];
                      newFilters[index] = { ...filter, value: e.target.value };
                      setPendingFilters((prev) => ({
                        ...prev,
                        [header]: newFilters,
                      }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyPendingFilters(header);
                    }}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                  <Select
                    value={filter.operation}
                    onValueChange={(value) => {
                      const newFilters = [...pendingFilters[header]];
                      newFilters[index] = {
                        ...filter,
                        operation: value as FilterOperation,
                      };
                      setPendingFilters((prev) => ({
                        ...prev,
                        [header]: newFilters,
                      }));
                    }}
                  >
                    <SelectTrigger className="w-[130px] h-8">
                      <SelectValue placeholder="Operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="doesNotContain">
                        Does not contain
                      </SelectItem>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="notEquals">Not equals</SelectItem>
                      <SelectItem value="greaterThan">Greater than</SelectItem>
                      <SelectItem value="greaterThanOrEqual">
                        Greater than or equal
                      </SelectItem>
                      <SelectItem value="lessThan">Less than</SelectItem>
                      <SelectItem value="lessThanOrEqual">
                        Less than or equal
                      </SelectItem>
                      <SelectItem value="blank">Blank</SelectItem>
                      <SelectItem value="notBlank">Not blank</SelectItem>
                      <SelectItem value="regex">Regex</SelectItem>
                      <SelectItem value="pandas">Pandas</SelectItem>
                    </SelectContent>
                  </Select>
                  {pendingFilters[header].length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        const newFilters = pendingFilters[header].filter(
                          (_, i) => i !== index
                        );
                        setPendingFilters((prev) => ({
                          ...prev,
                          [header]: newFilters,
                        }));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )
            )}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newFilter: AdvancedFilter = {
                      id: Date.now().toString(),
                      value: "",
                      operation: "contains",
                    };
                    setPendingFilters((prev) => ({
                      ...prev,
                      [header]: [...(prev[header] || []), newFilter],
                    }));
                  }}
                >
                  Add Filter
                </Button>
                {(pendingFilters[header]?.length ?? 0) > 1 && (
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`filter-logic-${header}`}
                      className="text-sm"
                    >
                      Logic:
                    </Label>
                    <div className="flex border rounded-md">
                      <Button
                        type="button"
                        variant={
                          pendingFilterLogic[header] === "AND"
                            ? "default"
                            : "ghost"
                        }
                        size="sm"
                        className="rounded-r-none h-8"
                        onClick={() =>
                          setPendingFilterLogic((prev) => ({
                            ...prev,
                            [header]: "AND",
                          }))
                        }
                      >
                        AND
                      </Button>
                      <Button
                        type="button"
                        variant={
                          pendingFilterLogic[header] === "OR"
                            ? "default"
                            : "ghost"
                        }
                        size="sm"
                        className="rounded-l-none h-8"
                        onClick={() =>
                          setPendingFilterLogic((prev) => ({
                            ...prev,
                            [header]: "OR",
                          }))
                        }
                      >
                        OR
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => applyPendingFilters(header)}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
