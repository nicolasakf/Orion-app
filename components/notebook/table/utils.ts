import type { AdvancedFilter, ColumnStats } from "./types";

/**
 * Create a cell key from row index and column name.
 * Uses indexOf to handle column names containing `:`.
 */
export function cellKey(rowIndex: number, colName: string): string {
  return `${rowIndex}:${colName}`;
}

/**
 * Parse a cell key into row index and column name.
 * Uses indexOf instead of split to handle column names containing `:`.
 */
export function parseCellKey(key: string): {
  rowIndex: number;
  colName: string;
} {
  const colonIndex = key.indexOf(":");
  return {
    rowIndex: Number.parseInt(key.substring(0, colonIndex)),
    colName: key.substring(colonIndex + 1),
  };
}

/**
 * Apply an advanced filter operation to a cell value.
 * Returns true if the value matches the filter.
 */
export function applyAdvancedFilter(
  value: string,
  filter: AdvancedFilter
): boolean {
  const strValue = String(value).toLowerCase();
  const filterValue = filter.value.toLowerCase();

  switch (filter.operation) {
    case "contains":
      return strValue.includes(filterValue);
    case "doesNotContain":
      return !strValue.includes(filterValue);
    case "equals":
      return strValue === filterValue;
    case "notEquals":
      return strValue !== filterValue;
    case "greaterThan": {
      const numValue = Number.parseFloat(strValue);
      const numFilterValue = Number.parseFloat(filterValue);
      return !isNaN(numValue) && !isNaN(numFilterValue) && numValue > numFilterValue;
    }
    case "greaterThanOrEqual": {
      const numValue = Number.parseFloat(strValue);
      const numFilterValue = Number.parseFloat(filterValue);
      return !isNaN(numValue) && !isNaN(numFilterValue) && numValue >= numFilterValue;
    }
    case "lessThan": {
      const numValue = Number.parseFloat(strValue);
      const numFilterValue = Number.parseFloat(filterValue);
      return !isNaN(numValue) && !isNaN(numFilterValue) && numValue < numFilterValue;
    }
    case "lessThanOrEqual": {
      const numValue = Number.parseFloat(strValue);
      const numFilterValue = Number.parseFloat(filterValue);
      return !isNaN(numValue) && !isNaN(numFilterValue) && numValue <= numFilterValue;
    }
    case "blank":
      return strValue === "";
    case "notBlank":
      return strValue !== "";
    case "regex":
      try {
        const regex = new RegExp(filterValue);
        return regex.test(strValue);
      } catch {
        return false;
      }
    case "pandas":
      if (filterValue.startsWith("startswith:")) {
        return strValue.startsWith(filterValue.substring(11));
      } else if (filterValue.startsWith("endswith:")) {
        return strValue.endsWith(filterValue.substring(9));
      } else if (filterValue.startsWith("contains:")) {
        return strValue.includes(filterValue.substring(9));
      } else {
        return strValue.includes(filterValue);
      }
    default:
      return true;
  }
}

/**
 * Calculate statistics for a column's values
 */
export function calculateColumnStats(values: string[]): ColumnStats {
  const count = values.length;
  const numericValues = values
    .map((v) => {
      const cleaned = String(v).replace(/[^0-9.-]+/g, "");
      return Number.parseFloat(cleaned);
    })
    .filter((n) => !isNaN(n));

  const numericCount = numericValues.length;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let avg = 0;

  if (numericCount > 0) {
    sum = numericValues.reduce((a, b) => a + b, 0);
    min = Math.min(...numericValues);
    max = Math.max(...numericValues);
    avg = sum / numericCount;
  }

  const valueCounts: Record<string, number> = {};
  values.forEach((v) => {
    const strValue = String(v);
    valueCounts[strValue] = (valueCounts[strValue] || 0) + 1;
  });

  const uniqueValues = Object.entries(valueCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));

  return {
    count,
    numericCount,
    sum: numericCount > 0 ? sum : null,
    min: numericCount > 0 ? min : null,
    max: numericCount > 0 ? max : null,
    avg: numericCount > 0 ? avg : null,
    uniqueValues,
  };
}
