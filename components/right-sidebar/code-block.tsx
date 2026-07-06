"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, Code, Copy, Maximize2 } from "lucide-react";
import { useTheme } from "next-themes";

import {
  CheckmarkedButton,
  useCheckmarkedFeedback,
} from "@/components/common/checkmarked-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ScrollGradientOverlays, useScrollEdgeIndicators } from "@/components/right-sidebar/scroll-edge-gradient";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Prism),
  { ssr: false }
);

import {
  CHAT_MARKDOWN_TABLE_MAX_HEIGHT_CLASS,
  CODE_BLOCK_INLINE_MAX_HEIGHT_CLASS,
} from "@/lib/right-sidebar/code-block-constants";

export {
  CHAT_MARKDOWN_TABLE_MAX_HEIGHT_CLASS,
  CODE_BLOCK_INLINE_MAX_HEIGHT_CLASS,
} from "@/lib/right-sidebar/code-block-constants";

const MAX_HIGHLIGHT_CHARS = 15_000;
const MAX_INLINE_LINES = 24;

interface CodeBlockProps {
  /** The code content to display. */
  code: string;
  /** The programming language for syntax highlighting. */
  language?: string;
  /** Optional className for styling. */
  className?: string;
}

function normalizeLanguage(language: string): string {
  const lower = language.toLowerCase();
  if (lower === "js") return "javascript";
  if (lower === "ts") return "typescript";
  if (lower === "py") return "python";
  if (lower === "sh") return "bash";
  return lower;
}

function shouldHighlight(code: string, language: string): boolean {
  const normalized = normalizeLanguage(language);
  return (
    code.length <= MAX_HIGHLIGHT_CHARS &&
    normalized !== "text" &&
    normalized !== "txt" &&
    normalized !== "plain"
  );
}

function useDarkSyntaxStyle() {
  const { resolvedTheme } = useTheme();
  const [style, setStyle] = React.useState<Record<string, React.CSSProperties> | null>(null);
  const isDark = resolvedTheme === "dark";

  React.useEffect(() => {
    if (!isDark) return;
    let cancelled = false;
    void import("react-syntax-highlighter/dist/cjs/styles/prism").then((mod) => {
      if (!cancelled) setStyle(mod.vscDarkPlus);
    });
    return () => {
      cancelled = true;
    };
  }, [isDark]);

  return isDark ? style : undefined;
}

function CodeText({
  code,
  language,
  expanded = false,
}: {
  code: string;
  language: string;
  expanded?: boolean;
}) {
  const normalizedLanguage = normalizeLanguage(language);
  const highlight = shouldHighlight(code, normalizedLanguage);
  const darkSyntaxStyle = useDarkSyntaxStyle();

  if (highlight) {
    if (darkSyntaxStyle === null) {
      return (
        <PlainCodeText code={code} expanded={expanded} />
      );
    }

    return (
      <SyntaxHighlighter
        language={normalizedLanguage}
        style={darkSyntaxStyle}
        customStyle={{
          margin: 0,
          background: "transparent",
          fontSize: expanded ? "12px" : "11px",
          lineHeight: 1.45,
          padding: expanded ? "12px" : "8px",
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
      >
        {code}
      </SyntaxHighlighter>
    );
  }

  return <PlainCodeText code={code} expanded={expanded} />;
}

function PlainCodeText({
  code,
  expanded = false,
}: {
  code: string;
  expanded?: boolean;
}) {
  return (
    <pre
      className={cn(
        "m-0 min-w-full whitespace-pre overflow-x-auto font-mono leading-snug text-foreground",
        expanded ? "p-3 text-xs" : "p-2 text-[11px]"
      )}
    >
      <code>{code}</code>
    </pre>
  );
}

/**
 * Lightweight read-only code block for assistant messages.
 * Avoids mounting Monaco editors in chat history while preserving copy,
 * collapse, and expanded viewing affordances.
 */
export function CodeBlock({
  code,
  language = "text",
  className,
}: CodeBlockProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const { checked: showCheck, showCheckmark } = useCheckmarkedFeedback();
  const lineCount = React.useMemo(() => code.split("\n").length, [code]);
  const maxInlineHeight = lineCount > MAX_INLINE_LINES ? CODE_BLOCK_INLINE_MAX_HEIGHT_CLASS : "";

  const { scrollRef, scrollEdges } = useScrollEdgeIndicators({
    active: !isCollapsed,
    contentKey: code,
  });

  /** Copy code to the clipboard and briefly show success state. */
  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      showCheckmark();
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }, [code, showCheckmark]);

  return (
    <Dialog>
      <div className={cn("relative isolate", className)}>
        <Card className="relative w-full max-w-full overflow-hidden">
          <div className="flex items-center bg-muted px-1 py-0.5">
            <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5">
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 text-left"
                onClick={() => setIsCollapsed((value) => !value)}
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? "Expand code block" : "Collapse code block"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                )}
                <Code className="h-3 w-3 shrink-0 text-green-500" />
                <span className="truncate text-xs font-medium leading-tight">{language}</span>
              </button>

              <div className="flex items-center gap-0.5">
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
                    aria-label="Open code block"
                  >
                    <Maximize2 />
                  </Button>
                </DialogTrigger>
                <CheckmarkedButton
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
                  onClick={handleCopy}
                  aria-label="Copy code"
                  checked={showCheck}
                  icon={<Copy />}
                />
              </div>
            </div>
          </div>

          <CardContent className={cn("p-0", isCollapsed && "hidden")}>
            <div className="relative min-w-0">
              <div
                ref={scrollRef}
                className={cn(
                  "scrollbar-hide border-t border-sidebar-border bg-sidebar overflow-auto",
                  maxInlineHeight
                )}
              >
                <CodeText code={code} language={language} />
              </div>
              <ScrollGradientOverlays edges={scrollEdges} />
            </div>
          </CardContent>
        </Card>
      </div>

      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        className="max-w-4xl border-0"
      >
        <div className="mt-2 max-h-[75vh] overflow-auto">
          <CodeText code={code} language={language} expanded />
        </div>
      </DialogContent>
    </Dialog>
  );
}
