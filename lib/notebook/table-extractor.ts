/**
 * Extract table data from HTML string.
 * Handles pandas DataFrames where index values are rendered as <th> in <tbody>.
 */
export function extractTableFromHTML(html: string): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const table = doc.querySelector("table")

  if (!table) {
    return { headers: [], rows: [] }
  }

  const headerRow = table.querySelector("thead tr") || table.querySelector("tr")
  if (!headerRow) {
    return { headers: [], rows: [] }
  }

  // Detect pandas index: first header <th> is empty and tbody rows contain <th> elements
  const headerCells = headerRow.querySelectorAll("th, td")
  const firstBodyRow = table.querySelector("tbody tr")
  const hasPandasIndex =
    headerCells.length > 0 &&
    (headerCells[0].textContent?.trim() === "") &&
    firstBodyRow !== null &&
    firstBodyRow.querySelector("th") !== null

  const headers: string[] = []

  if (hasPandasIndex) {
    // Use "Index" for the empty first header, then collect the rest
    headers.push("Index")
    for (let i = 1; i < headerCells.length; i++) {
      headers.push(headerCells[i].textContent?.trim() || `Column ${i}`)
    }
  } else {
    headerCells.forEach((cell) => {
      headers.push(cell.textContent?.trim() || `Column ${headers.length + 1}`)
    })
  }

  // Extract rows — query both th and td to capture pandas index values
  const rows: Record<string, string>[] = []
  const dataRows = table.querySelectorAll("tbody tr, tr:not(:first-child)")

  dataRows.forEach((row) => {
    const rowData: Record<string, string> = {}
    const cells = row.querySelectorAll("th, td")

    cells.forEach((cell, index) => {
      if (index < headers.length) {
        rowData[headers[index]] = cell.textContent?.trim() || ""
      }
    })

    if (Object.keys(rowData).length > 0) {
      rows.push(rowData)
    }
  })

  return { headers, rows }
}

/**
 * True when HTML parsed as a pandas-style table with no data rows (empty DataFrame).
 * In that case callers should prefer `text/plain` over rendering or stripping HTML.
 */
export function isEmptyDataframeHtmlTable(
  html: string,
  extracted: { headers: string[]; rows: Record<string, string>[] }
): boolean {
  if (extracted.rows.length > 0) return false
  return (
    extracted.headers.length > 0 ||
    /\bclass=["']dataframe["']/.test(html)
  )
}

/**
 * Extract table data from text (like pandas DataFrame output)
 */
export function extractTableFromText(text: string): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const isPandasOutput =
    text.includes("DataFrame") || (text.includes("   ") && text.includes("\n") && text.includes("dtype:"))

  if (isPandasOutput) {
    return extractPandasDataFrame(text)
  }

  const lines = text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return { headers: [], rows: [] }
  }

  let delimiter = "\t"
  const firstLine = lines[0]

  if (firstLine.includes(",") && !firstLine.includes("\t")) {
    delimiter = ","
  } else if (firstLine.includes("|") && !firstLine.includes("\t")) {
    delimiter = "|"
  }

  const headers = firstLine.split(delimiter).map((header) => header.trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const values = line.split(delimiter)
    const rowData: Record<string, string> = {}

    values.forEach((value, index) => {
      if (index < headers.length) {
        rowData[headers[index]] = value.trim()
      }
    })

    rows.push(rowData)
  }

  return { headers, rows }
}

/**
 * Extract table data from pandas DataFrame text output
 */
function extractPandasDataFrame(text: string): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const lines = text.split("\n").filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    return { headers: [], rows: [] }
  }

  let headerLine = lines[0]
  let startIndex = 1

  if (headerLine.includes("DataFrame") || !headerLine.match(/\s+\w+/)) {
    headerLine = lines[1]
    startIndex = 2
  }

  const headerMatch = headerLine.match(/\s+(\w+(?:\s+\w+)*)/g)
  if (!headerMatch) {
    return { headers: [], rows: [] }
  }

  const headers = headerMatch.map((h) => h.trim())
  const hasIndex = lines[startIndex].trim().match(/^\d+/)
  const rows: Record<string, string>[] = []

  for (let i = startIndex; i < lines.length; i++) {
    if (lines[i].includes("dtype:") || lines[i].includes("[") || lines[i].includes("]")) {
      continue
    }

    const rowValues = lines[i].trim().split(/\s+/).filter(Boolean)

    if (rowValues.length < headers.length) {
      continue
    }

    const rowData: Record<string, string> = {}
    const startCol = hasIndex ? 1 : 0

    for (let j = 0; j < headers.length; j++) {
      rowData[headers[j]] = rowValues[j + startCol] || ""
    }

    rows.push(rowData)
  }

  return { headers, rows }
}
