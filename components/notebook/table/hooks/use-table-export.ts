import { useCallback } from "react";

import * as XLSX from "xlsx";
import { parseCellKey } from "../utils";

interface UseTableExportArgs {
  processedData: Record<string, string>[];
  visibleColumns: string[];
  selectedCells: Set<string>;
  selectedRows: Set<number>;
  selectedColumns: Set<string>;
}

/** Handles copy-to-clipboard, CSV, and Excel export */
export function useTableExport({
  processedData,
  visibleColumns,
  selectedCells,
  selectedRows,
  selectedColumns,
}: UseTableExportArgs) {
  const copyToClipboard = useCallback(() => {
    let textToCopy = "";

    if (selectedCells.size > 0) {
      const cellsByRow: Record<number, Record<string, string>> = {};
      selectedCells.forEach((key) => {
        const { rowIndex, colName } = parseCellKey(key);
        const row = processedData[rowIndex];
        if (row) {
          if (!cellsByRow[rowIndex]) cellsByRow[rowIndex] = {};
          cellsByRow[rowIndex][colName] = row[colName] || "";
        }
      });

      const selectedColNames = new Set<string>();
      selectedCells.forEach((key) => {
        const { colName } = parseCellKey(key);
        selectedColNames.add(colName);
      });

      const orderedColumns = visibleColumns.filter((col) =>
        selectedColNames.has(col)
      );
      textToCopy = orderedColumns.join("\t") + "\n";
      Object.keys(cellsByRow)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((rowIdx) => {
          const rowData = cellsByRow[rowIdx];
          textToCopy +=
            orderedColumns.map((col) => rowData[col] || "").join("\t") + "\n";
        });
    } else if (selectedRows.size > 0) {
      textToCopy = visibleColumns.join("\t") + "\n";
      Array.from(selectedRows)
        .sort((a, b) => a - b)
        .forEach((rowIdx) => {
          const row = processedData[rowIdx];
          if (row) {
            textToCopy +=
              visibleColumns.map((col) => row[col] || "").join("\t") + "\n";
          }
        });
    } else if (selectedColumns.size > 0) {
      const selectedCols = Array.from(selectedColumns);
      textToCopy = selectedCols.join("\t") + "\n";
      processedData.forEach((row) => {
        textToCopy +=
          selectedCols.map((col) => row[col] || "").join("\t") + "\n";
      });
    } else {
      textToCopy = visibleColumns.join("\t") + "\n";
      processedData.forEach((row) => {
        textToCopy +=
          visibleColumns.map((col) => row[col] || "").join("\t") + "\n";
      });
    }

    navigator.clipboard
      .writeText(textToCopy)
      .catch((err) => console.error("Failed to copy: ", err));
  }, [processedData, visibleColumns, selectedCells, selectedRows, selectedColumns]);

  const exportToExcel = useCallback(() => {
    const ws = XLSX.utils.json_to_sheet(
      processedData.map((row) => {
        const newRow: Record<string, string> = {};
        visibleColumns.forEach((col) => (newRow[col] = row[col] || ""));
        return newRow;
      })
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Table Data");
    XLSX.writeFile(wb, "table_export.xlsx");
  }, [processedData, visibleColumns]);

  const exportToCSV = useCallback(() => {
    const csvContent = [
      visibleColumns.join(","),
      ...processedData.map((row) =>
        visibleColumns
          .map(
            (header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`
          )
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "table-export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [processedData, visibleColumns]);

  return {
    copyToClipboard,
    exportToExcel,
    exportToCSV,
  };
}
