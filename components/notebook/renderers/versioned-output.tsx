"use client";

import { useEffect, useMemo, useState, type JSX } from "react";
import { History } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getVersionedOutputSnapshots,
  parseVersionedOutputPayload,
} from "@/lib/notebook/versioned-output";
import type { NotebookOutputType } from "@/lib/types";
import type { NotebookMimeRendererProps } from "./types";

/** Formats a captured UTC timestamp in the user's local date and time format. */
function formatCapturedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Renders saved versions through the same MIME pipeline as ordinary outputs. */
export function VersionedOutputRenderer({
  output,
  value,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const parsed = useMemo(() => parseVersionedOutputPayload(value), [value]);
  const currentId = parsed.status === "valid" ? parsed.payload.current.id : null;
  const [selectedId, setSelectedId] = useState<string | null>(currentId);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setSelectedId(currentId);
  }, [currentId]);

  if (parsed.status === "invalid") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <div className="font-medium">Versioned output could not be rendered</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {parsed.errors.map((error, index) => (
            <li key={`${error}-${index}`}>{error}</li>
          ))}
        </ul>
      </div>
    );
  }

  const snapshots = getVersionedOutputSnapshots(output, parsed.payload);
  const selectedIndex = Math.max(
    0,
    snapshots.findIndex((snapshot) => snapshot.id === selectedId),
  );
  const selected = snapshots[selectedIndex] ?? snapshots[0];
  const outerMetadata = { ...(output.metadata ?? {}) };
  delete outerMetadata.orion;
  const nestedOutput: NotebookOutputType | null = selected
    ? {
        output_type: output.output_type,
        execution_count: output.execution_count,
        data: selected.data as NotebookOutputType["data"],
        metadata: { ...selected.metadata, ...outerMetadata },
      }
    : null;
  const selectedVersionNumber = snapshots.length - selectedIndex;

  return (
    <div className="group/versioned-output relative min-w-0">
      {snapshots.length > 1 ? (
        <div
          data-open={menuOpen ? "true" : "false"}
          className="pointer-events-none absolute right-1 top-1 z-30 opacity-0 transition-opacity group-hover/versioned-output:pointer-events-auto group-hover/versioned-output:opacity-100 group-focus-within/versioned-output:pointer-events-auto group-focus-within/versioned-output:opacity-100 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100"
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-md border bg-background/95 px-2 text-xs text-muted-foreground shadow-sm backdrop-blur hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Select output version. Version ${selectedVersionNumber} selected.`}
              >
                <History className="h-3.5 w-3.5" />
                Version {selectedVersionNumber}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              <DropdownMenuRadioGroup
                value={selected?.id}
                onValueChange={setSelectedId}
              >
                {snapshots.map((snapshot, index) => {
                  const versionNumber = snapshots.length - index;
                  return (
                    <DropdownMenuRadioItem
                      key={snapshot.id}
                      value={snapshot.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <span>
                        Version {versionNumber}
                        {index === 0 ? " (latest)" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatCapturedAt(snapshot.createdAt)}
                      </span>
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {nestedOutput && selected
        ? actions.renderNestedOutput?.(nestedOutput, selected.id)
        : null}
    </div>
  );
}
