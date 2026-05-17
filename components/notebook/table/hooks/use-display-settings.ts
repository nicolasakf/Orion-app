import { useCallback } from "react";
import { useOrionSettings } from "@/hooks/use-orion-settings";

import {
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  MIN_VISIBLE_ROWS,
  MAX_VISIBLE_ROWS,
} from "../constants";

/** Manages table display settings: font size, row height, visible rows, freeze header, column widths */
export function useDisplaySettings() {
  const { effectiveSettings, setUserSettings } = useOrionSettings();

  const freezeHeader = effectiveSettings.table.display.freezeHeader;
  const fontSize = effectiveSettings.table.display.fontSize;
  const rowHeight = effectiveSettings.table.display.rowHeight;
  const visibleRowCount = effectiveSettings.table.display.visibleRowCount;
  const columnWidths = effectiveSettings.table.display.columnWidths;
  const toolbarVisible = effectiveSettings.table.display.toolbarVisible;

  const updateDisplaySettings = useCallback(
    (updates: Partial<typeof effectiveSettings.table.display>) => {
      void setUserSettings((current) => ({
        ...current,
        table: {
          ...current.table,
          display: {
            ...current.table.display,
            ...updates,
          },
        },
      }));
    },
    [setUserSettings]
  );

  const setFontSize = useCallback((size: number) => {
    updateDisplaySettings({
      fontSize: Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size)),
    });
  }, [updateDisplaySettings]);

  const setRowHeight = useCallback((height: number) => {
    updateDisplaySettings({
      rowHeight: Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, height)),
    });
  }, [updateDisplaySettings]);

  const setVisibleRowCount = useCallback((count: number) => {
    updateDisplaySettings({
      visibleRowCount: Math.max(MIN_VISIBLE_ROWS, Math.min(MAX_VISIBLE_ROWS, count)),
    });
  }, [updateDisplaySettings]);

  const setFreezeHeader = useCallback((frozen: boolean) => {
    updateDisplaySettings({ freezeHeader: frozen });
  }, [updateDisplaySettings]);

  const setToolbarVisible = useCallback((visible: boolean) => {
    updateDisplaySettings({ toolbarVisible: visible });
  }, [updateDisplaySettings]);

  const handleColumnResize = useCallback(
    (column: string, width: number) => {
      updateDisplaySettings({
        columnWidths: {
          ...columnWidths,
          [column]: width,
        },
      });
    },
    [columnWidths, updateDisplaySettings]
  );

  return {
    freezeHeader,
    setFreezeHeader,
    fontSize,
    setFontSize,
    rowHeight,
    setRowHeight,
    visibleRowCount,
    setVisibleRowCount,
    columnWidths,
    handleColumnResize,
    toolbarVisible,
    setToolbarVisible,
  };
}
