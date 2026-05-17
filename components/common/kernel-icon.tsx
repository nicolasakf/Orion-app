"use client";

import { useMemo } from "react";
import { Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getIcon } from "material-file-icons";

interface KernelIconProps {
  /** Kernel language (e.g. "python", "javascript") or name (e.g. "python3") */
  language?: string;
  name?: string;
  className?: string;
  size?: number;
}

/** Maps a kernel language/name to a representative filename for icon lookup. */
function languageToFilename(lang: string): string | null {
  const l = lang.toLowerCase();
  if (l.includes("python")) return "script.py";
  if (l.includes("javascript") || l.includes("node")) return "script.js";
  if (l.includes("typescript")) return "script.ts";
  if (l.includes("r") && !l.includes("ru")) return "script.r";
  if (l.includes("julia")) return "script.jl";
  return null;
}

/**
 * Compact icon for a kernel, based on its language.
 * Uses material-file-icons when a matching language is found, falls back to a generic code icon.
 */
export function KernelIcon({
  language,
  name,
  className,
  size = 16,
}: KernelIconProps): React.JSX.Element {
  const lang = language || name || "";

  const svg = useMemo(() => {
    const filename = languageToFilename(lang);
    if (!filename) return null;
    return getIcon(filename).svg;
  }, [lang]);

  if (svg) {
    return (
      <div
        className={cn("shrink-0", className)}
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <Code2
      className={cn("shrink-0 text-muted-foreground", className)}
      style={{ width: size, height: size }}
    />
  );
}
