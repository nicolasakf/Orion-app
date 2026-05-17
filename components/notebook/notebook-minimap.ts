"use client"

import type { NotebookCellType, NotebookOutputType } from "@/lib/types"
import { CellType } from "@/lib/types"
import {
  getDefaultMimeRegistry,
  getOutputMimeBundle,
} from "@/lib/notebook/mime-registry"

/** Visual kind used to badge an output in the minimap */
export enum MinimapOutputKind {
  IMAGE = "image",
  TABLE = "table",
  PLOTLY = "plotly",
  ERROR = "error",
  STREAM = "stream",
  HTML = "html",
  TEXT = "text",
}

/** Compact representation of a single cell output for the minimap */
export interface NotebookMinimapOutput {
  kind: MinimapOutputKind
  /** Index of this output within the parent cell's outputs array */
  outputIndex: number
  /** Short, non-interactive text summary used by compact and miniature previews. */
  summary: string | null
  /** Data URL for raster/SVG image outputs that can be shown as a real thumbnail. */
  imageDataUrl: string | null
}

/** Compact representation of a cell for display inside a minimap section */
export interface NotebookMinimapCell {
  /** Stable id — metadata.orion.id when present, otherwise the cell index as string */
  cellId: string
  cellIndex: number
  cell_type: CellType
  /** Intentionally empty; minimap previews never expose notebook cell source. */
  source: string
  /** Output summaries (only populated for code cells that have outputs) */
  outputs: NotebookMinimapOutput[]
}

/** A section in the notebook minimap, delimited by a markdown heading */
export interface NotebookMinimapSection {
  id: string
  /** null for the leading untitled group that appears before any heading */
  headingText: string | null
  /**
   * Heading depth: 0 for the untitled leading section, 1–6 for ATX headings.
   * The UI uses this for indentation when rendering nested sections.
   */
  headingLevel: number
  /**
   * Index of the markdown cell that contains the heading that opened this section.
   * null for the untitled leading section.
   */
  headingCellIndex: number | null
  /** All non-heading cells that fall inside this section, in notebook order */
  cells: NotebookMinimapCell[]
  /**
   * Child heading sections nested under this one (outline hierarchy).
   * Built from the flat section stream so that collapsing a parent hides all
   * descendants (e.g. collapsing H1 hides every H2–H6 until the next sibling H1).
   */
  children: NotebookMinimapSection[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Classifies a single cell output into a MinimapOutputKind for badge display */
function classifyOutput(output: NotebookOutputType): MinimapOutputKind {
  const mimeRegistry = getDefaultMimeRegistry()
  const kind = mimeRegistry.classify(output)
  switch (kind) {
    case "image":
      return MinimapOutputKind.IMAGE
    case "table":
      return MinimapOutputKind.TABLE
    case "plotly":
      return MinimapOutputKind.PLOTLY
    case "error":
      return MinimapOutputKind.ERROR
    case "stream":
      return MinimapOutputKind.STREAM
    case "html":
      return MinimapOutputKind.HTML
    case "text":
    default:
      return MinimapOutputKind.TEXT
  }
}

/** Convert a MIME value that may be stored as line chunks into one string. */
function joinMimeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join("")
  }
  return value === null || value === undefined ? "" : String(value)
}

/** Returns the first directly thumbnailable image payload from an output. */
function getOutputImageDataUrl(output: NotebookOutputType): string | null {
  const bundle = getOutputMimeBundle(output)
  const imageMime = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ].find((mimeType) => bundle[mimeType] !== undefined)

  if (!imageMime) {
    return null
  }

  const rawData = joinMimeValue(bundle[imageMime]).trim()
  if (!rawData) {
    return null
  }

  if (rawData.startsWith("data:")) {
    return rawData
  }

  const encodedData =
    imageMime === "image/svg+xml"
      ? encodeURIComponent(rawData)
      : rawData.replace(/\s/g, "")

  return `data:${imageMime};${imageMime === "image/svg+xml" ? "utf8" : "base64"},${encodedData}`
}

/** Builds the compact output object consumed by the minimap panel. */
function buildMinimapOutput(
  output: NotebookOutputType,
  outputIndex: number
): NotebookMinimapOutput {
  const mimeRegistry = getDefaultMimeRegistry()

  return {
    kind: classifyOutput(output),
    outputIndex,
    summary: mimeRegistry.summarize(output),
    imageDataUrl: getOutputImageDataUrl(output),
  }
}

/** Returns a stable cell identifier */
function getCellId(cell: NotebookCellType, cellIndex: number): string {
  return (cell.metadata?.orion?.id as string | undefined) ?? String(cellIndex)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a minimap section tree from the notebook cells.
 *
 * Each ATX markdown heading (# … to ###### …) found as the **first** heading
 * in a markdown cell starts a new section. Cells before the first heading are
 * grouped into a leading untitled section; that section is omitted when it
 * would be empty.
 *
 * Sections are then nested by heading depth so that a parent heading (e.g. H1)
 * owns all deeper headings (H2–H6) until the next sibling at the same or
 * higher level — matching a typical outline. Collapsing a parent in the UI
 * hides every descendant section and its cells.
 */
export function buildNotebookMinimap(
  cells: NotebookCellType[]
): NotebookMinimapSection[] {
  const sections: NotebookMinimapSection[] = []
  let sectionCounter = 0

  let current: NotebookMinimapSection = {
    id: "section-pre",
    headingText: null,
    headingLevel: 0,
    headingCellIndex: null,
    cells: [],
    children: [],
  }

  // Only match the FIRST heading in a markdown cell
  const headingRegex = /^(#{1,6})\s+(.+)$/m

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const source = Array.isArray(cell.source) ? cell.source : []

    if (cell.cell_type === CellType.MARKDOWN) {
      const markdown = source.join("")
      const match = headingRegex.exec(markdown)

      if (match) {
        // Flush the section we were building (only if it has real content)
        if (current.headingText !== null || current.cells.length > 0) {
          sections.push(current)
        }
        sectionCounter++
        current = {
          id: `section-${sectionCounter}`,
          headingText: match[2].trim(),
          headingLevel: match[1].length,
          headingCellIndex: i,
          cells: [],
          children: [],
        }
        // The heading cell itself becomes the section header — not repeated as a child item
        continue
      }

      continue
    }

    if (cell.cell_type !== CellType.CODE) {
      continue
    }

    // Collect outputs for code cells
    const outputs: NotebookMinimapOutput[] = []
    if (cell.cell_type === CellType.CODE && cell.outputs) {
      for (let j = 0; j < cell.outputs.length; j++) {
        outputs.push(buildMinimapOutput(cell.outputs[j], j))
      }
    }

    if (outputs.length === 0) {
      continue
    }

    current.cells.push({
      cellId: getCellId(cell, i),
      cellIndex: i,
      cell_type: cell.cell_type,
      source: "",
      outputs,
    })
  }

  // Push the final section
  if (current.headingText !== null || current.cells.length > 0) {
    sections.push(current)
  }

  return nestNotebookSections(sections)
}

/**
 * Turns the flat section list (one block per heading, in document order) into a
 * heading tree: each section becomes a child of the nearest previous heading
 * with a strictly smaller level. Collapsing a parent in the UI therefore hides
 * every deeper heading and its cells until the next sibling at the same or
 * higher level.
 */
function nestNotebookSections(
  flat: NotebookMinimapSection[]
): NotebookMinimapSection[] {
  const roots: NotebookMinimapSection[] = []
  const stack: { node: NotebookMinimapSection; level: number }[] = []

  for (const section of flat) {
    const level = section.headingLevel

    if (section.headingText === null) {
      const node: NotebookMinimapSection = {
        ...section,
        children: [],
      }
      roots.push(node)
      stack.length = 0
      stack.push({ node, level: 0 })
      continue
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop()
    }

    const node: NotebookMinimapSection = {
      ...section,
      children: [],
    }

    const parent = stack.length > 0 ? stack[stack.length - 1].node : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }

    stack.push({ node, level })
  }

  return roots
}
