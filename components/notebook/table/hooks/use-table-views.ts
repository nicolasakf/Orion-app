import { useState, useCallback } from "react";
import { useOrionSettings } from "@/hooks/use-orion-settings";

import type {
  TableView,
  FilterConfig,
  AdvancedFilterConfig,
  SortConfig,
} from "../types";

interface UseTableViewsArgs {
  /** Current filter config to save into views */
  filterConfig: FilterConfig;
  advancedFilterConfig: AdvancedFilterConfig;
  sortConfig: SortConfig;
  searchTerm: string;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  freezeHeader: boolean;
  fontSize: number;
  rowHeight: number;
  /** Setters to restore state when applying a view */
  setFilterConfig: (config: FilterConfig) => void;
  setAdvancedFilterConfig: (config: AdvancedFilterConfig) => void;
  setSortConfig: (config: SortConfig) => void;
  setSearchTerm: (term: string) => void;
  setVisibleColumns: (columns: string[]) => void;
  setColumnWidths: (widths: Record<string, number>) => void;
  setFreezeHeader: (frozen: boolean) => void;
  setFontSize: (size: number) => void;
  setRowHeight: (height: number) => void;
  /** Default values for reset */
  defaultHeaders: string[];
}

/**
 * Manages saved table views with save, apply, delete, rename, and default reset.
 * Bug fix: TableView now captures all display state.
 * Bug fix: clicking "Default" resets to default state.
 */
export function useTableViews({
  filterConfig,
  advancedFilterConfig,
  sortConfig,
  searchTerm,
  visibleColumns,
  columnWidths,
  freezeHeader,
  fontSize,
  rowHeight,
  setFilterConfig,
  setAdvancedFilterConfig,
  setSortConfig,
  setSearchTerm,
  setVisibleColumns,
  setColumnWidths,
  setFreezeHeader,
  setFontSize,
  setRowHeight,
  defaultHeaders,
}: UseTableViewsArgs) {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const views = effectiveSettings.table.views;
  const [activeView, setActiveView] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const saveCurrentView = useCallback(() => {
    if (!newViewName.trim()) return;

    const newView: TableView = {
      id: Date.now().toString(),
      name: newViewName,
      filterConfig: { ...filterConfig },
      advancedFilterConfig: { ...advancedFilterConfig },
      sortConfig,
      searchTerm,
      visibleColumns: [...visibleColumns],
      columnWidths: { ...columnWidths },
      freezeHeader,
      fontSize,
      rowHeight,
    };

    void setUserSettings((current) => ({
      ...current,
      table: {
        ...current.table,
        views: [...current.table.views, newView],
      },
    }));
    setActiveView(newView.id);
    setNewViewName("");
    setIsViewDialogOpen(false);
  }, [
    newViewName,
    filterConfig,
    advancedFilterConfig,
    sortConfig,
    searchTerm,
    visibleColumns,
    columnWidths,
    freezeHeader,
    fontSize,
    rowHeight,
    setUserSettings,
  ]);

  const applyView = useCallback(
    (viewId: string) => {
      const view = views.find((v) => v.id === viewId);
      if (!view) return;

      setFilterConfig({ ...view.filterConfig });
      setAdvancedFilterConfig({ ...view.advancedFilterConfig });
      setSortConfig(view.sortConfig);
      setSearchTerm(view.searchTerm);
      setVisibleColumns([...view.visibleColumns]);
      setColumnWidths({ ...view.columnWidths });
      setFreezeHeader(view.freezeHeader);
      setFontSize(view.fontSize);
      setRowHeight(view.rowHeight);
      setActiveView(viewId);
    },
    [
      views,
      setFilterConfig,
      setAdvancedFilterConfig,
      setSortConfig,
      setSearchTerm,
      setVisibleColumns,
      setColumnWidths,
      setFreezeHeader,
      setFontSize,
      setRowHeight,
    ]
  );

  /** Bug fix: resets ALL state to defaults, not just activeView */
  const resetToDefault = useCallback(() => {
    setFilterConfig({});
    setAdvancedFilterConfig({});
    setSortConfig(null);
    setSearchTerm("");
    setVisibleColumns([...defaultHeaders]);
    setColumnWidths({});
    setFreezeHeader(true);
    setFontSize(14);
    setRowHeight(40);
    setActiveView(null);
  }, [
    defaultHeaders,
    setFilterConfig,
    setAdvancedFilterConfig,
    setSortConfig,
    setSearchTerm,
    setVisibleColumns,
    setColumnWidths,
    setFreezeHeader,
    setFontSize,
    setRowHeight,
  ]);

  const deleteView = useCallback(
    (viewId: string) => {
      void setUserSettings((current) => ({
        ...current,
        table: {
          ...current.table,
          views: current.table.views.filter((view) => view.id !== viewId),
        },
      }));
      if (activeView === viewId) {
        resetToDefault();
      }
    },
    [activeView, resetToDefault, setUserSettings]
  );

  const renameView = useCallback(
    (viewId: string, newName: string) => {
      void setUserSettings((current) => ({
        ...current,
        table: {
          ...current.table,
          views: current.table.views.map((view) =>
            view.id === viewId ? { ...view, name: newName } : view
          ),
        },
      }));
    },
    [setUserSettings]
  );

  return {
    views,
    activeView,
    setActiveView,
    newViewName,
    setNewViewName,
    isViewDialogOpen,
    setIsViewDialogOpen,
    saveCurrentView,
    applyView,
    resetToDefault,
    deleteView,
    renameView,
  };
}
