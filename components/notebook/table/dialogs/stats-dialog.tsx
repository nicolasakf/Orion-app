"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ColumnStats } from "../types";

interface StatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statsColumn: string | null;
  columnStats: ColumnStats | null;
}

/** Dialog showing column statistics (count, sum, avg, min, max, top values) */
export function StatsDialog({
  open,
  onOpenChange,
  statsColumn,
  columnStats,
}: StatsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Statistics for {statsColumn}</DialogTitle>
        </DialogHeader>
        {columnStats && (
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm font-medium">Count:</div>
              <div>{columnStats.count}</div>

              {columnStats.numericCount > 0 && (
                <>
                  <div className="text-sm font-medium">Numeric values:</div>
                  <div>{columnStats.numericCount}</div>
                  <div className="text-sm font-medium">Sum:</div>
                  <div>
                    {columnStats.sum?.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-sm font-medium">Average:</div>
                  <div>
                    {columnStats.avg?.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-sm font-medium">Min:</div>
                  <div>
                    {columnStats.min?.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-sm font-medium">Max:</div>
                  <div>
                    {columnStats.max?.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </>
              )}
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Top Values:</h4>
              <div className="max-h-[200px] overflow-y-auto">
                {columnStats.uniqueValues
                  .slice(0, 10)
                  .map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between text-sm py-1 border-b"
                    >
                      <span>{item.value}</span>
                      <span className="text-muted-foreground">
                        {item.count}
                      </span>
                    </div>
                  ))}
                {columnStats.uniqueValues.length > 10 && (
                  <div className="text-sm text-muted-foreground pt-2">
                    ...and {columnStats.uniqueValues.length - 10} more
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
