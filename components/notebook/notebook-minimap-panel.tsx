"use client"

import { useState, useEffect, useRef } from "react"
import {
  ChevronRight,
  ChevronDown,
  Image,
  Table,
  BarChart2,
  AlertCircle,
  Terminal,
  Globe,
  AlignLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CellType } from "@/lib/types"
import {
  MinimapOutputKind,
  type NotebookMinimapSection,
  type NotebookMinimapCell,
  type NotebookMinimapOutput,
} from "./notebook-minimap"

// ---------------------------------------------------------------------------
// Output badge
// ---------------------------------------------------------------------------

const OUTPUT_KIND_META: Record<
  MinimapOutputKind,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  [MinimapOutputKind.IMAGE]: { label: "Image", Icon: Image },
  [MinimapOutputKind.TABLE]: { label: "Table", Icon: Table },
  [MinimapOutputKind.PLOTLY]: { label: "Plot", Icon: BarChart2 },
  [MinimapOutputKind.ERROR]: { label: "Error", Icon: AlertCircle },
  [MinimapOutputKind.STREAM]: { label: "Output", Icon: Terminal },
  [MinimapOutputKind.HTML]: { label: "HTML", Icon: Globe },
  [MinimapOutputKind.TEXT]: { label: "Text", Icon: AlignLeft },
}

const OUTPUT_PREVIEW_MAX_LINES = 4

interface AggregatedBadge {
  kind: MinimapOutputKind
  count: number
  /** Index of the first output of this kind — used as the navigation target */
  firstOutputIndex: number
}

/** Groups outputs of the same kind together, preserving first-encounter order */
function aggregateOutputs(outputs: NotebookMinimapOutput[]): AggregatedBadge[] {
  const seen = new Map<MinimapOutputKind, AggregatedBadge>()
  const order: MinimapOutputKind[] = []

  for (const out of outputs) {
    const existing = seen.get(out.kind)
    if (existing) {
      existing.count++
    } else {
      seen.set(out.kind, { kind: out.kind, count: 1, firstOutputIndex: out.outputIndex })
      order.push(out.kind)
    }
  }

  return order.map((k) => seen.get(k)!)
}

/** Removes synthetic renderer labels so previews focus on useful content. */
function cleanOutputSummary(summary: string | null): string {
  return (summary ?? "")
    .replace(/^\[[^\]]+\]\s*/u, "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim()
}

/** Returns a short single-line summary for compact output rows. */
function getCompactOutputSummary(output: NotebookMinimapOutput): string {
  const compact = cleanOutputSummary(output.summary).split(/\r?\n/u).find(Boolean)
  return compact ?? OUTPUT_KIND_META[output.kind].label
}

/** Returns a few non-empty lines for tiny text and table previews. */
function getMiniatureOutputLines(output: NotebookMinimapOutput): string[] {
  return cleanOutputSummary(output.summary)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, OUTPUT_PREVIEW_MAX_LINES)
}

interface AggregatedOutputBadgeProps {
  badge: AggregatedBadge
  cellIndex: number
  onNavigate: (cellIndex: number, outputIndex: number) => void
}

function AggregatedOutputBadge({ badge, cellIndex, onNavigate }: AggregatedOutputBadgeProps) {
  const meta = OUTPUT_KIND_META[badge.kind]
  const { Icon } = meta
  const isError = badge.kind === MinimapOutputKind.ERROR

  return (
    <button
      type="button"
      className={cn(
        "corner-squircle inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[7px] font-medium leading-tight transition-colors",
        "border border-border/40 hover:bg-muted",
        isError ? "text-red-500 border-red-400/30" : "text-muted-foreground"
      )}
      title={
        badge.count > 1
          ? `${badge.count}× ${meta.label} — click to navigate to first`
          : `${meta.label} — click to navigate`
      }
      onClick={(e) => {
        e.stopPropagation()
        onNavigate(cellIndex, badge.firstOutputIndex)
      }}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      {badge.count > 1
        ? <span>{badge.count}× {meta.label}</span>
        : <span>{meta.label}</span>
      }
    </button>
  )
}

// ---------------------------------------------------------------------------
// Cell card — miniature representation of a real notebook cell
// ---------------------------------------------------------------------------

interface CellCardProps {
  cell: NotebookMinimapCell
  previewMode: NotebookMinimapPreviewMode
  isSelected?: boolean
  onNavigate: (cellIndex: number, outputIndex?: number) => void
}

/** Available output preview renderings for minimap cell cards. */
export type NotebookMinimapPreviewMode = "miniature" | "compact"

/** Renders a lightweight, non-interactive miniature of a single output. */
function OutputMiniature({ output }: { output: NotebookMinimapOutput }) {
  const meta = OUTPUT_KIND_META[output.kind]
  const { Icon } = meta
  const lines = getMiniatureOutputLines(output)

  if (output.imageDataUrl) {
    return (
      <div className="h-20 overflow-hidden bg-background">
        <img
          src={output.imageDataUrl}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          draggable={false}
        />
      </div>
    )
  }

  if (output.kind === MinimapOutputKind.TABLE) {
    const tableLines = lines.length > 0 ? lines : ["Table output"]
    return (
      <div className="grid h-20 grid-rows-4 gap-px bg-border/40 p-px">
        {tableLines.map((line, rowIndex) => (
          <div
            key={`${output.outputIndex}-${rowIndex}`}
            className="grid grid-cols-3 gap-px bg-background"
          >
            {line.split(/\t| {2,}/u).slice(0, 3).map((value, colIndex) => (
              <span
                key={`${output.outputIndex}-${rowIndex}-${colIndex}`}
                className="truncate bg-muted/35 px-1 py-0.5 text-[7px] leading-tight text-muted-foreground"
              >
                {value}
              </span>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (output.kind === MinimapOutputKind.PLOTLY) {
    const title = (lines.find((line) => line.startsWith("Title: ")) ?? lines[0] ?? "Plot")
      .replace(/^Title:\s*/u, "")

    return (
      <div className="h-20 overflow-hidden bg-background px-2 py-1.5">
        <svg
          viewBox="0 0 120 52"
          className="h-14 w-full text-muted-foreground"
          aria-hidden
        >
          <path d="M12 8v34h98" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
          <path d="M18 36 35 24 52 30 70 15 91 21 108 9" fill="none" stroke="rgb(59 130 246)" strokeWidth="2" />
          <rect x="20" y="27" width="7" height="15" rx="1" fill="rgb(16 185 129)" fillOpacity="0.65" />
          <rect x="40" y="18" width="7" height="24" rx="1" fill="rgb(16 185 129)" fillOpacity="0.65" />
          <rect x="60" y="31" width="7" height="11" rx="1" fill="rgb(16 185 129)" fillOpacity="0.65" />
          <rect x="80" y="21" width="7" height="21" rx="1" fill="rgb(16 185 129)" fillOpacity="0.65" />
        </svg>
        <span className="block truncate text-[7px] leading-tight text-muted-foreground">
          {title}
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "h-20 overflow-hidden px-1.5 py-1",
        output.kind === MinimapOutputKind.ERROR
          ? "bg-red-500/[0.07] text-red-600 dark:text-red-400"
          : "bg-background text-muted-foreground"
      )}
    >
      <div className="mb-0.5 flex items-center gap-1 text-[8px] font-medium">
        <Icon className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{meta.label}</span>
      </div>
      <div className="space-y-0.5">
        {(lines.length > 0 ? lines : [meta.label]).map((line, index) => (
          <p
            key={`${output.outputIndex}-${index}`}
            className="truncate text-[7px] leading-tight"
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

/** Renders one output in compact mode. */
function CompactOutputRow({
  output,
  onNavigate,
}: {
  output: NotebookMinimapOutput
  onNavigate: (outputIndex: number) => void
}) {
  const meta = OUTPUT_KIND_META[output.kind]
  const { Icon } = meta
  const isError = output.kind === MinimapOutputKind.ERROR

  return (
    <button
      type="button"
      className={cn(
        "corner-squircle flex w-full items-center gap-1 rounded px-1.5 py-1 text-left transition-colors hover:bg-muted",
        isError ? "text-red-500" : "text-muted-foreground"
      )}
      title={`${meta.label} — click to navigate`}
      onClick={(e) => {
        e.stopPropagation()
        onNavigate(output.outputIndex)
      }}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate text-[9px] leading-tight">
        {getCompactOutputSummary(output)}
      </span>
    </button>
  )
}

/** Renders one output in miniature mode. */
function MiniatureOutputCard({
  output,
  onNavigate,
}: {
  output: NotebookMinimapOutput
  onNavigate: (outputIndex: number) => void
}) {
  const meta = OUTPUT_KIND_META[output.kind]

  return (
    <button
      type="button"
      className="corner-squircle block w-full overflow-hidden rounded border border-border/50 text-left transition-colors hover:border-border/80 hover:bg-muted/30"
      title={`${meta.label} — click to navigate`}
      onClick={(e) => {
        e.stopPropagation()
        onNavigate(output.outputIndex)
      }}
    >
      <OutputMiniature output={output} />
    </button>
  )
}

/** Renders a navigable minimap cell row without exposing code cell source. */
function CellCard({
  cell,
  previewMode,
  isSelected = false,
  onNavigate,
}: CellCardProps) {
  const isCode = cell.cell_type === CellType.CODE
  const hasOutputs = isCode && cell.outputs.length > 0

  const cardShellClass = cn(
    "corner-squircle rounded border overflow-hidden transition-colors",
    "border-border/50 bg-muted/20",
    isSelected && "ring-1 ring-blue-500 ring-opacity-70"
  )

  if (!hasOutputs) {
    return null
  }

  if (previewMode === "compact") {
    return (
      <div className={cn(cardShellClass, "flex flex-col gap-0.5 p-0.5")}>
        {cell.outputs.slice(0, 4).map((output) => (
          <CompactOutputRow
            key={output.outputIndex}
            output={output}
            onNavigate={(outputIndex) => onNavigate(cell.cellIndex, outputIndex)}
          />
        ))}
        {cell.outputs.length > 4 && (
          <div className="flex flex-wrap gap-1 px-1 pb-0.5">
            {aggregateOutputs(cell.outputs.slice(4)).map((badge) => (
              <AggregatedOutputBadge
                key={badge.kind}
                badge={badge}
                cellIndex={cell.cellIndex}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn(cardShellClass, "flex flex-col gap-1 p-1")}>
      {cell.outputs.slice(0, 2).map((output) => (
        output.kind === MinimapOutputKind.TEXT || output.kind === MinimapOutputKind.STREAM ? (
          <CompactOutputRow
            key={output.outputIndex}
            output={output}
            onNavigate={(outputIndex) => onNavigate(cell.cellIndex, outputIndex)}
          />
        ) : (
          <MiniatureOutputCard
            key={output.outputIndex}
            output={output}
            onNavigate={(outputIndex) => onNavigate(cell.cellIndex, outputIndex)}
          />
        )
      ))}
      {cell.outputs.length > 2 && (
        <div className="flex flex-wrap gap-1">
          {aggregateOutputs(cell.outputs.slice(2)).map((badge) => (
            <AggregatedOutputBadge
              key={badge.kind}
              badge={badge}
              cellIndex={cell.cellIndex}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section row
// ---------------------------------------------------------------------------

interface SectionRowProps {
  section: NotebookMinimapSection
  /** Controlled override — when this changes all sections snap open or closed */
  forceOpen?: boolean
  previewMode?: NotebookMinimapPreviewMode
  showOutputs?: boolean
  selectedCellIndex?: number | null
  onNavigate: (cellIndex: number, outputIndex?: number) => void
}

/**
 * Renders one section node and, when expanded, its direct cell cards plus all
 * nested child heading sections. Collapsing a parent hides the entire subtree.
 */
/** Delay before treating a heading click as navigation — allows double-click to toggle instead */
const HEADING_NAVIGATE_DELAY_MS = 220

function SectionRow({
  section,
  forceOpen = true,
  previewMode = "compact",
  showOutputs = true,
  selectedCellIndex = null,
  onNavigate,
}: SectionRowProps) {
  const [open, setOpen] = useState(forceOpen)
  const headingNavigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Synchronise whenever the parent forces all-open or all-closed
  useEffect(() => {
    setOpen(forceOpen)
  }, [forceOpen])

  useEffect(() => {
    return () => {
      if (headingNavigateTimerRef.current) {
        clearTimeout(headingNavigateTimerRef.current)
      }
    }
  }, [])

  const headingIndent = Math.max(0, section.headingLevel - 1) * 4

  const hasChildSections = section.children.length > 0

  // Leading untitled section — cell cards, then nested heading sections (H1, …)
  if (section.headingText === null) {
    return (
      <div className="flex flex-col gap-1.5 px-1">
        {section.cells.map((cell) => (
          showOutputs ? (
            <CellCard
              key={cell.cellId}
              cell={cell}
              previewMode={previewMode}
              isSelected={cell.cellIndex === selectedCellIndex}
              onNavigate={onNavigate}
            />
          ) : null
        ))}
        {hasChildSections && (
          <div className="flex flex-col gap-2 mt-0.5">
            {section.children.map((child) => (
              <SectionRow
                key={child.id}
                section={child}
                forceOpen={forceOpen}
                previewMode={previewMode}
                showOutputs={showOutputs}
                selectedCellIndex={selectedCellIndex}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const flushHeadingNavigate = () => {
    if (headingNavigateTimerRef.current) {
      clearTimeout(headingNavigateTimerRef.current)
      headingNavigateTimerRef.current = null
    }
  }

  const scheduleHeadingNavigate = () => {
    if (headingNavigateTimerRef.current) {
      flushHeadingNavigate()
      return
    }
    headingNavigateTimerRef.current = setTimeout(() => {
      headingNavigateTimerRef.current = null
      if (section.headingCellIndex !== null) {
        onNavigate(section.headingCellIndex)
      }
    }, HEADING_NAVIGATE_DELAY_MS)
  }

  return (
    <div>
      {/* ── Section header — double-click toggles expand/collapse (entire subtree) ── */}
      <div
        className="flex items-center gap-0.5 group"
        style={{ paddingLeft: headingIndent }}
        onDoubleClick={() => setOpen((v) => !v)}
      >
        {/* Chevron — single click toggles; stop dblclick so header row does not toggle a third time */}
        <button
          type="button"
          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          onClick={() => setOpen((v) => !v)}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={open ? "Collapse section" : "Expand section"}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>

        {/* Heading text — clicking navigates to the heading cell */}
        <button
          type="button"
          className={cn(
            "flex-1 min-w-0 text-left px-1 py-0.5 rounded truncate transition-colors",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            section.headingLevel === 1
              ? "text-[12px] font-semibold text-foreground"
              : section.headingLevel === 2
                ? "text-[11px] font-semibold text-foreground"
                : "text-[11px] font-normal text-muted-foreground"
          )}
          title="Click to go to heading — double-click to expand or collapse"
          onClick={scheduleHeadingNavigate}
          onDoubleClick={(e) => {
            e.stopPropagation()
            flushHeadingNavigate()
            setOpen((v) => !v)
          }}
        >
          {section.headingText}
        </button>
      </div>

      {/* ── Direct cells + nested heading sections (all hidden when collapsed) ── */}
      {open && (
        <div
          className="flex flex-col gap-1.5 mt-1 ml-3 pl-1.5 border-l border-border/30"
          style={{ marginLeft: headingIndent + 8 }}
        >
          {showOutputs && section.cells.length > 0 && (
            section.cells.map((cell) => (
              <CellCard
                key={cell.cellId}
                cell={cell}
                previewMode={previewMode}
                isSelected={cell.cellIndex === selectedCellIndex}
                onNavigate={onNavigate}
              />
            ))
          )}
          {hasChildSections && (
            <div className="flex flex-col gap-2">
              {section.children.map((child) => (
                <SectionRow
                  key={child.id}
                  section={child}
                  forceOpen={forceOpen}
                  previewMode={previewMode}
                  showOutputs={showOutputs}
                  selectedCellIndex={selectedCellIndex}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel root
// ---------------------------------------------------------------------------

export interface NotebookMinimapPanelProps {
  sections: NotebookMinimapSection[]
  /** Called when the user clicks any navigable element in the minimap */
  onNavigate: (cellIndex: number, outputIndex?: number) => void
  /** When true all sections are forced open; when false all are collapsed */
  allOpen?: boolean
  /** Controls how each cell output preview is rendered. */
  previewMode?: NotebookMinimapPreviewMode
  /** When false, only notebook heading rows are rendered. */
  showOutputs?: boolean
  /** Cell index selected in the main notebook editor. */
  selectedCellIndex?: number | null
}

/**
 * Renders the notebook minimap — a scrollable panel of collapsible sections
 * containing miniature cell cards. Every element (section header, cell card,
 * output badge) is independently clickable for navigation.
 */
export function NotebookMinimapPanel({
  sections,
  onNavigate,
  allOpen = true,
  previewMode = "compact",
  showOutputs = true,
  selectedCellIndex = null,
}: NotebookMinimapPanelProps) {
  if (sections.length === 0) {
    return (
      <div className="px-3 py-3 text-xs text-muted-foreground italic">
        No notebook content
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 py-2 px-1.5">
      {sections.map((section) => (
        <SectionRow
          key={section.id}
          section={section}
          forceOpen={allOpen}
          previewMode={previewMode}
          showOutputs={showOutputs}
          selectedCellIndex={selectedCellIndex}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}
