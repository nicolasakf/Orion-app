import { useState, useCallback } from "react";

import type {
  FilterConfig,
  AdvancedFilterConfig,
  AdvancedFilter,
  FilterOperation,
} from "../types";

/** Manages all filter state and operations */
export function useTableFilters(visibleColumns: string[]) {
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({});
  const [advancedFilterConfig, setAdvancedFilterConfig] =
    useState<AdvancedFilterConfig>({});
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(
    null
  );
  const [pendingFilters, setPendingFilters] = useState<
    Record<string, AdvancedFilter[]>
  >({});
  const [pendingFilterLogic, setPendingFilterLogic] = useState<
    Record<string, "AND" | "OR">
  >({});

  const handleFilterChange = useCallback(
    (column: string, value: string) => {
      setFilterConfig((prev) => {
        const newConfig = { ...prev };
        if (value === "") delete newConfig[column];
        else newConfig[column] = value;
        return newConfig;
      });
    },
    []
  );

  const handleAddFilter = useCallback((column: string) => {
    setAdvancedFilterConfig((prev) => {
      const newConfig = { ...prev };
      if (!newConfig[column]) {
        newConfig[column] = {
          filters: [
            { id: Date.now().toString(), value: "", operation: "contains" },
          ],
          condition: "AND",
        };
      } else {
        newConfig[column] = {
          ...newConfig[column],
          filters: [
            ...newConfig[column].filters,
            { id: Date.now().toString(), value: "", operation: "contains" },
          ],
        };
      }
      return newConfig;
    });
  }, []);

  const handleRemoveFilter = useCallback(
    (column: string, filterId: string) => {
      setAdvancedFilterConfig((prev) => {
        const newConfig = { ...prev };
        if (newConfig[column]) {
          const remaining = newConfig[column].filters.filter(
            (f) => f.id !== filterId
          );
          if (remaining.length === 0) {
            delete newConfig[column];
          } else {
            newConfig[column] = { ...newConfig[column], filters: remaining };
          }
        }
        return newConfig;
      });
    },
    []
  );

  const handleFilterValueChange = useCallback(
    (column: string, filterId: string, value: string) => {
      setAdvancedFilterConfig((prev) => {
        const newConfig = { ...prev };
        if (newConfig[column]) {
          newConfig[column] = {
            ...newConfig[column],
            filters: newConfig[column].filters.map((f) =>
              f.id === filterId ? { ...f, value } : f
            ),
          };
        }
        return newConfig;
      });
    },
    []
  );

  const handleFilterOperationChange = useCallback(
    (column: string, filterId: string, operation: FilterOperation) => {
      setAdvancedFilterConfig((prev) => {
        const newConfig = { ...prev };
        if (newConfig[column]) {
          newConfig[column] = {
            ...newConfig[column],
            filters: newConfig[column].filters.map((f) =>
              f.id === filterId ? { ...f, operation } : f
            ),
          };
        }
        return newConfig;
      });
    },
    []
  );

  const handleFilterConditionChange = useCallback(
    (column: string, condition: "AND" | "OR") => {
      setAdvancedFilterConfig((prev) => {
        const newConfig = { ...prev };
        if (newConfig[column]) {
          newConfig[column] = { ...newConfig[column], condition };
        }
        return newConfig;
      });
    },
    []
  );

  /** Clear filters for a column. Bug fix: also resets activeFilterColumn. */
  const clearColumnFilters = useCallback(
    (column: string) => {
      setAdvancedFilterConfig((prev) => {
        const newConfig = { ...prev };
        delete newConfig[column];
        return newConfig;
      });
      setPendingFilters((prev) => {
        const newPending = { ...prev };
        delete newPending[column];
        return newPending;
      });
      // Bug fix: close the filter popover after clearing
      setActiveFilterColumn(null);
    },
    []
  );

  const applyFilterToAllColumns = useCallback(
    (column: string) => {
      setAdvancedFilterConfig((prev) => {
        if (!prev[column]) return prev;
        const columnFilters = prev[column];
        const newConfig = { ...prev };
        visibleColumns.forEach((col) => {
          if (col !== column) {
            newConfig[col] = {
              filters: columnFilters.filters.map((filter) => ({
                ...filter,
                id: Date.now().toString() + Math.random(),
              })),
              condition: columnFilters.condition,
            };
          }
        });
        return newConfig;
      });
    },
    [visibleColumns]
  );

  const clearAllFilters = useCallback(() => {
    setAdvancedFilterConfig({});
    setFilterConfig({});
    setActiveFilterColumn(null);
    setPendingFilters({});
    setPendingFilterLogic({});
  }, []);

  const hasColumnFilters = useCallback(
    (column: string): boolean =>
      (!!filterConfig[column] && filterConfig[column].length > 0) ||
      (!!advancedFilterConfig[column] &&
        advancedFilterConfig[column].filters.length > 0),
    [filterConfig, advancedFilterConfig]
  );

  const applyPendingFilters = useCallback(
    (column: string) => {
      if (!pendingFilters[column] || pendingFilters[column].length === 0) {
        setAdvancedFilterConfig((prev) => {
          const newConfig = { ...prev };
          delete newConfig[column];
          return newConfig;
        });
        setActiveFilterColumn(null);
        return;
      }
      setAdvancedFilterConfig((prev) => ({
        ...prev,
        [column]: {
          filters: [...pendingFilters[column]],
          condition: pendingFilterLogic[column] || "AND",
        },
      }));
      setActiveFilterColumn(null);
    },
    [pendingFilters, pendingFilterLogic]
  );

  /** Initialize pending filters when a popover opens (called via useEffect, not during render) */
  const initPendingFilters = useCallback(
    (column: string) => {
      if (!pendingFilters[column]) {
        const currentFilters = advancedFilterConfig[column]?.filters || [];
        setPendingFilters((prev) => ({
          ...prev,
          [column]: [...currentFilters],
        }));
        setPendingFilterLogic((prev) => ({
          ...prev,
          [column]: advancedFilterConfig[column]?.condition || "AND",
        }));
      }
    },
    [advancedFilterConfig, pendingFilters]
  );

  return {
    filterConfig,
    setFilterConfig,
    advancedFilterConfig,
    setAdvancedFilterConfig,
    activeFilterColumn,
    setActiveFilterColumn,
    pendingFilters,
    setPendingFilters,
    pendingFilterLogic,
    setPendingFilterLogic,
    handleFilterChange,
    handleAddFilter,
    handleRemoveFilter,
    handleFilterValueChange,
    handleFilterOperationChange,
    handleFilterConditionChange,
    clearColumnFilters,
    applyFilterToAllColumns,
    clearAllFilters,
    hasColumnFilters,
    applyPendingFilters,
    initPendingFilters,
  };
}
