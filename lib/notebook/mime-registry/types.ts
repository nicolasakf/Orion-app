import type { NotebookOutputType, OutputType } from "@/lib/types";

/** Synthetic output kinds used by notebook minimap badges. */
export type MimeOutputKind =
  | "image"
  | "table"
  | "plotly"
  | "error"
  | "stream"
  | "html"
  | "text";

/** Image payload that can be consumed by the agent multimodal response path. */
export interface MimeAgentImage {
  mimeType: string;
  data: string;
}

/** Structured result for agent-facing output reads. */
export interface MimeAgentResult {
  text: string;
  images?: MimeAgentImage[];
}

/** Structured clipboard payload derived from a rendered output. */
export type MimeClipboardPayload =
  | { kind: "text"; text: string }
  | { kind: "image"; mimeType: string; data: string };

/** Strongly typed resolved renderer candidate for one output. */
export interface ResolvedMimeRenderer {
  mimeType: string;
  value: unknown;
  factory: MimeRendererFactory;
}

/** Rendering model passed to UI renderers and text/summary helpers. */
export interface MimeModel {
  output: NotebookOutputType;
  mimeType: string;
  value: unknown;
  trusted: boolean;
  setData?: (nextData: Record<string, unknown>) => void;
}

/** Optional context used by UI renderers. */
export interface RenderContext {
  theme: "light" | "dark";
  trusted: boolean;
  sanitize: (html: string) => string;
}

/** Factory contract for MIME-aware output handling. */
export interface MimeRendererFactory {
  id: string;
  mimeTypes: string[];
  rank: number;
  safe: boolean;
  kind: MimeOutputKind;
  /** Whether the output should be wrapped in the collapsible output shell. */
  collapsible?: boolean;
  /** Whether the output should skip the output context menu wrapper. */
  disableContextMenu?: boolean;
  /** Restrict the renderer to specific Jupyter output types. */
  outputTypes?: OutputType[];
  classify?: (model: MimeModel) => MimeOutputKind;
  summarize?: (model: MimeModel) => string | null;
  toAgentResult?: (model: MimeModel) => MimeAgentResult | null;
  textLength?: (model: MimeModel) => number;
  toClipboard?: (model: MimeModel) => MimeClipboardPayload | null;
}

/** Registry contract for selecting and querying output renderers by MIME type. */
export interface MimeRegistry {
  addFactory(factory: MimeRendererFactory): void;
  preferredMimeType(output: NotebookOutputType, trusted?: boolean): string | null;
  resolve(output: NotebookOutputType, trusted?: boolean): ResolvedMimeRenderer | null;
  /**
   * Resolves a specific MIME from the output bundle (for presentation overrides), or null
   * if the mime is missing, the factory is blocked by output type, or untrusted+unsafe.
   */
  resolveForMimeType(
    output: NotebookOutputType,
    mimeType: string,
    trusted?: boolean
  ): ResolvedMimeRenderer | null;
  getFactoryForMime(mimeType: string): MimeRendererFactory | null;
  classify(output: NotebookOutputType, trusted?: boolean): MimeOutputKind;
  summarize(output: NotebookOutputType, trusted?: boolean): string | null;
  toAgentResult(output: NotebookOutputType, trusted?: boolean): MimeAgentResult | null;
  getTextLength(output: NotebookOutputType, trusted?: boolean): number;
  toClipboard(output: NotebookOutputType, trusted?: boolean): MimeClipboardPayload | null;
}
