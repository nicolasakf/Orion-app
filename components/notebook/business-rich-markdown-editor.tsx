"use client";

import React from "react";
import { Loader2 } from "lucide-react";

import type { Crepe } from "@milkdown/crepe";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface BusinessRichMarkdownEditorProps {
  cellIndex: number;
  source: string;
  onSave: (source: string) => Promise<void>;
  onCancel: () => void;
  onFinishEditing: () => void;
}

type EditorMode = "rich" | "source-gate" | "source";

interface MarkdownCompatibility {
  mode: Exclude<EditorMode, "source">;
  reason: string | null;
}

const htmlLikePattern = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*)?>/;
const directivePattern = /^\s*:::[^\n]*$/m;
const imagePattern = /!\[[^\]]*\](?:\([^\n)]*\)|\[[^\]]*\])/;
const mathJaxPattern = /\\(?:\(|\[)|\\begin\{[A-Za-z*]+\}/;
const mdxExpressionPattern = /(?:^|\n)\s*\{[^{}\n]+\}\s*(?=\n|$)/;
const mdxEsmPattern =
  /^(?:import\s+.+\s+from\s+|export\s+(?:const|default|function|class)\b)/m;

/** Detects a complete front-matter fence without rejecting a leading rule. */
function hasFrontMatter(source: string): boolean {
  const lines = source.split(/\r?\n/);
  const delimiter = lines[0]?.trim();
  if (delimiter !== "---" && delimiter !== "+++") return false;

  return lines.slice(1).some((line) => line.trim() === delimiter);
}

/**
 * Identifies Markdown whose constructs cannot be safely round-tripped by the
 * Business View visual editor. False positives intentionally retain source
 * editing so report content is never silently rewritten.
 */
export function getBusinessMarkdownCompatibility(
  source: string,
): MarkdownCompatibility {
  if (hasFrontMatter(source)) {
    return {
      mode: "source-gate",
      reason: "This block includes document front matter.",
    };
  }

  if (htmlLikePattern.test(source)) {
    return {
      mode: "source-gate",
      reason: "This block includes HTML or MDX-style content.",
    };
  }

  if (mdxExpressionPattern.test(source) || mdxEsmPattern.test(source)) {
    return {
      mode: "source-gate",
      reason: "This block includes HTML or MDX-style content.",
    };
  }

  if (directivePattern.test(source)) {
    return {
      mode: "source-gate",
      reason: "This block includes a Markdown directive.",
    };
  }

  if (imagePattern.test(source)) {
    return {
      mode: "source-gate",
      reason: "Image editing is not available in Business View yet.",
    };
  }

  if (mathJaxPattern.test(source)) {
    return {
      mode: "source-gate",
      reason: "This block uses an advanced MathJax delimiter.",
    };
  }

  return { mode: "rich", reason: null };
}

/**
 * Provides guarded source editing when a Markdown block cannot be safely
 * opened in Crepe's visual document model.
 */
function SourceFallback({
  cellIndex,
  reason,
  onEditSource,
  onCancel,
  onKeyDown,
}: {
  cellIndex: number;
  reason: string | null;
  onEditSource: () => void;
  onCancel: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
}): React.JSX.Element {
  return (
    <div
      className="jp-Cell jp-MarkdownCell corner-squircle rounded-md border border-border bg-background p-3 shadow-sm"
      data-app-view-cell-index={cellIndex}
      onKeyDown={onKeyDown}
    >
      <p className="text-sm leading-6 text-muted-foreground">
        {reason ?? "This content is not available in the visual editor."} To
        protect the report, it can only be edited as Markdown source.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onEditSource} autoFocus>
          Edit source
        </Button>
      </div>
    </div>
  );
}

/**
 * Renders a visual Markdown editor for safe report content and preserves an
 * opt-in source fallback for content that Crepe cannot round-trip safely.
 */
export function BusinessRichMarkdownEditor({
  cellIndex,
  source,
  onSave,
  onCancel,
  onFinishEditing,
}: BusinessRichMarkdownEditorProps): React.JSX.Element {
  const initialCompatibility = getBusinessMarkdownCompatibility(source);
  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const crepeRef = React.useRef<Crepe | null>(null);
  const [mode, setMode] = React.useState<EditorMode>(initialCompatibility.mode);
  const [fallbackReason, setFallbackReason] = React.useState<string | null>(
    initialCompatibility.reason,
  );
  const [sourceDraft, setSourceDraft] = React.useState(source);
  const [isEditorReady, setIsEditorReady] = React.useState(false);
  const [isEditorLoading, setIsEditorLoading] = React.useState(
    initialCompatibility.mode === "rich",
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const compatibility = getBusinessMarkdownCompatibility(source);
    setMode(compatibility.mode);
    setFallbackReason(compatibility.reason);
    setSourceDraft(source);
    setIsEditorReady(false);
    setIsEditorLoading(compatibility.mode === "rich");
    setIsSaving(false);
    setSaveError(null);
  }, [source]);

  /** Creates Crepe only in the browser and disposes its document listeners. */
  React.useEffect(() => {
    if (mode !== "rich") return;

    const root = editorRootRef.current;
    if (!root) return;

    let disposed = false;
    let createdCrepe: Crepe | null = null;
    setIsEditorLoading(true);
    setIsEditorReady(false);

    void (async () => {
      try {
        const { Crepe: CrepeConstructor } = await import("@milkdown/crepe");
        if (disposed) return;

        const crepe = new CrepeConstructor({
          root,
          defaultValue: source,
          features: {
            [CrepeConstructor.Feature.TopBar]: true,
            [CrepeConstructor.Feature.ImageBlock]: false,
            [CrepeConstructor.Feature.AI]: false,
          },
        });
        createdCrepe = crepe;
        await crepe.create();

        if (disposed) {
          void crepe.destroy().catch(() => undefined);
          return;
        }

        crepeRef.current = crepe;
        root
          .querySelector<HTMLElement>('[contenteditable="true"]')
          ?.setAttribute("aria-label", `Edit markdown cell ${cellIndex + 1}`);
        setIsEditorReady(true);
      } catch (error) {
        if (disposed) return;

        if (createdCrepe) {
          void createdCrepe.destroy().catch(() => undefined);
        }
        console.error("Could not start the Business Markdown editor:", error);
        setFallbackReason(
          "The visual editor could not start for this content.",
        );
        setMode("source-gate");
      } finally {
        if (!disposed) setIsEditorLoading(false);
      }
    })();

    return () => {
      disposed = true;
      const crepe = crepeRef.current;
      crepeRef.current = null;
      if (crepe) {
        void crepe.destroy().catch(() => undefined);
      }
    };
  }, [cellIndex, mode, source]);

  /** Saves the current editor draft only after the user confirms it. */
  const handleSave = React.useCallback(async () => {
    if (isSaving) return;

    let nextSource: string;
    if (mode === "source") {
      nextSource = sourceDraft;
    } else {
      const crepe = crepeRef.current;
      if (!crepe || !isEditorReady) return;

      try {
        nextSource = crepe.getMarkdown();
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Could not prepare this content for saving.",
        );
        return;
      }
    }

    setIsSaving(true);
    setSaveError(null);
    crepeRef.current?.setReadonly(true);
    try {
      await onSave(nextSource);
      onFinishEditing();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save this content.",
      );
      crepeRef.current?.setReadonly(false);
    } finally {
      setIsSaving(false);
    }
  }, [isEditorReady, isSaving, mode, onFinishEditing, onSave, sourceDraft]);

  /** Handles the Business View save and cancel keyboard shortcuts. */
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented || isSaving) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        void handleSave();
      }
    },
    [handleSave, isSaving, onCancel],
  );

  if (mode === "source-gate") {
    return (
      <SourceFallback
        cellIndex={cellIndex}
        reason={fallbackReason}
        onEditSource={() => setMode("source")}
        onCancel={onCancel}
        onKeyDown={handleKeyDown}
      />
    );
  }

  if (mode === "source") {
    return (
      <div
        className="jp-Cell jp-MarkdownCell corner-squircle rounded-md border border-border bg-background p-3 shadow-sm"
        data-app-view-cell-index={cellIndex}
      >
        <Textarea
          autoFocus
          aria-label={`Edit markdown cell ${cellIndex + 1}`}
          value={sourceDraft}
          onChange={(event) => setSourceDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="min-h-40 resize-y bg-sidebar text-sm leading-6"
        />
        {saveError ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {saveError}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="orion-business-rich-markdown jp-Cell jp-MarkdownCell corner-squircle rounded-md border border-border bg-background shadow-sm"
      data-app-view-cell-index={cellIndex}
      onKeyDown={handleKeyDown}
      aria-busy={isEditorLoading || isSaving}
    >
      <div ref={editorRootRef} />
      {isEditorLoading ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading editor...
        </div>
      ) : null}
      {saveError ? (
        <p className="px-3 pb-1 text-sm text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border px-3 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={!isEditorReady || isSaving}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}
