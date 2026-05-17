import { useState, useCallback } from "react";

import type { ColumnStats } from "../types";
import { calculateColumnStats } from "../utils";

/** Manages column statistics dialog state and calculation */
export function useColumnStats(
  processedData: Record<string, string>[]
) {
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const [statsColumn, setStatsColumn] = useState<string | null>(null);
  const [columnStats, setColumnStats] = useState<ColumnStats | null>(null);

  const showColumnStats = useCallback(
    (columnName: string) => {
      const values = processedData.map((row) => row[columnName] || "");
      const stats = calculateColumnStats(values);
      setStatsColumn(columnName);
      setColumnStats(stats);
      setShowStatsDialog(true);
    },
    [processedData]
  );

  return {
    showStatsDialog,
    setShowStatsDialog,
    statsColumn,
    columnStats,
    showColumnStats,
  };
}
