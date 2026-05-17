import { useState, useMemo, useEffect, useCallback } from "react";

import type {
  SortConfig,
  FilterConfig,
  AdvancedFilterConfig,
  GroupConfig,
} from "../types";
import { applyAdvancedFilter } from "../utils";

interface UseTableDataArgs {
  rows: Record<string, string>[];
  filterConfig: FilterConfig;
  advancedFilterConfig: AdvancedFilterConfig;
  searchTerm: string;
  sortConfig: SortConfig;
}

/** Processes raw data through filter, search, and sort pipeline */
export function useTableData({
  rows,
  filterConfig,
  advancedFilterConfig,
  searchTerm,
  sortConfig,
}: UseTableDataArgs) {
  const [originalData, setOriginalData] = useState<Record<string, string>[]>(
    []
  );
  const [groupConfig, setGroupConfig] = useState<GroupConfig>(null);

  useEffect(() => {
    setOriginalData([...rows]);
  }, [rows]);

  const processedData = useMemo(() => {
    let processed = [...originalData];

    // Apply simple filters
    Object.entries(filterConfig).forEach(([key, value]) => {
      if (value.includes("|")) {
        const filterValues = value.split("|");
        processed = processed.filter((row) =>
          filterValues.some((filterValue) =>
            (row[key] || "").toLowerCase().includes(filterValue.toLowerCase())
          )
        );
      } else {
        processed = processed.filter((row) =>
          (row[key] || "").toLowerCase().includes(value.toLowerCase())
        );
      }
    });

    // Apply advanced filters
    Object.entries(advancedFilterConfig).forEach(([column, columnFilter]) => {
      processed = processed.filter((row) => {
        const cellValue = row[column] || "";
        if (columnFilter.condition === "AND") {
          return columnFilter.filters.every((filter) =>
            applyAdvancedFilter(cellValue, filter)
          );
        } else {
          return columnFilter.filters.some((filter) =>
            applyAdvancedFilter(cellValue, filter)
          );
        }
      });
    });

    // Apply search
    if (searchTerm) {
      processed = processed.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply sort
    if (sortConfig) {
      processed.sort((a, b) => {
        const aValue = a[sortConfig.key] || "";
        const bValue = b[sortConfig.key] || "";
        const aNum = Number.parseFloat(
          String(aValue).replace(/[^0-9.-]+/g, "")
        );
        const bNum = Number.parseFloat(
          String(bValue).replace(/[^0-9.-]+/g, "")
        );
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortConfig.direction === "asc" ? aNum - bNum : bNum - aNum;
        }
        return sortConfig.direction === "asc"
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue));
      });
    }

    return processed;
  }, [originalData, sortConfig, filterConfig, advancedFilterConfig, searchTerm]);

  const handleGroupChange = useCallback(
    (column: string | null) => setGroupConfig(column),
    []
  );

  return {
    originalData,
    setOriginalData,
    processedData,
    groupConfig,
    handleGroupChange,
  };
}
