import type { ReactNode } from "react";

import type ansiToHtml from "ansi-to-html";
import type { NotebookOutputType } from "@/lib/types";
import type {
  OrionUiLocalValue,
  OrionUiStateChangeContext,
} from "@/components/notebook/orion-ui-primitives";
import type {
  OrionTableCommResponse,
  OrionTableOutputMetadata,
  OrionTableRequest,
} from "@/components/notebook/orion-ui-table/types";

/**
 * “Presentation” submenu: switch which MIME in the output bundle is shown
 * (when the bundle has more than one renderable representation).
 */
export interface NotebookOutputPresentationMenu {
  options: { mimeType: string; label: string }[];
  value: string;
  onValueChange: (mimeType: string) => void;
}

/** Shared action handlers exposed to output renderers. */
export interface NotebookOutputActionHandlers {
  cellIndex: number;
  outputIndex: number;
  onClearOutput?: (cellIndex: number, outputIndex: number) => void;
  onCopyOutput?: (cellIndex: number, outputIndex: number) => void;
  onHideOutput?: (cellIndex: number, outputIndex: number) => void;
  onMentionOutput?: (cellIndex: number, outputIndex: number) => void;
  /** Opens the output's source cell in Notebook View. */
  onGoToSource?: (cellIndex: number) => void;
  onToggleOutputAppView?: (cellIndex: number, outputIndex: number) => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
    change?: OrionUiStateChangeContext,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
  onOrionUiUnmount?: (outputId?: string) => void;
  onOrionUiTableRequest?: (
    request: OrionTableRequest,
  ) => Promise<OrionTableCommResponse>;
  onOrionUiTableMetadataChange?: (
    cellIndex: number,
    outputIndex: number,
    metadata: OrionTableOutputMetadata,
  ) => void;
  /** Renders an Orion UI output reference addressed by stable Orion cell id. */
  renderOrionUiOutputReference?: (
    cellId: string | undefined,
    outputIndex: number,
  ) => ReactNode;
  isInAppView?: boolean;
  /** When true, App View toggle labels are shortened for Business View. */
  businessMode?: boolean;
  /** Opens the output in a full-screen dialog (provided by OutputRenderer). */
  onOpenFullScreen?: () => void;
  /** When true, the renderer is displayed inside the full-screen dialog. */
  isFullScreen?: boolean;
  /** When set, the output context menu includes a Presentation submenu. */
  presentationMenu?: NotebookOutputPresentationMenu | null;
}

/** Common props used by MIME-specific notebook output renderers. */
export interface NotebookMimeRendererProps {
  output: NotebookOutputType;
  notebookMetadata?: Record<string, unknown>;
  mimeType: string;
  value: unknown;
  theme: "light" | "dark";
  trusted: boolean;
  ansiConverter: ansiToHtml;
  sanitize: (html: string) => string;
  actions: NotebookOutputActionHandlers;
}

/**
 * Convert a mime payload into a plain string.
 * MIME values frequently arrive as arrays of text chunks.
 */
export function toJoinedString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join("");
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
