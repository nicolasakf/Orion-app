"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type CustomIconProps = {
  /** SVG filename in public/assets/icons (with or without .svg extension). */
  filename: string;
  className?: string;
};

const svgCache = new Map<string, string>();

/** Resolve a filename to its public assets/icons URL. */
function resolveIconPath(filename: string): string {
  const normalized = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  return `/assets/icons/${normalized}`;
}

/** Fetch and cache SVG markup, stripping fixed dimensions so className controls size. */
async function loadSvg(filename: string): Promise<string> {
  const path = resolveIconPath(filename);
  const cached = svgCache.get(path);
  if (cached) return cached;

  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Custom icon not found: ${path}`);
  }

  const raw = await response.text();
  const processed = raw.replace(/\s(width|height)="[^"]*"/g, "");
  svgCache.set(path, processed);
  return processed;
}

/**
 * Renders a custom SVG icon from public/assets/icons by filename.
 * Accepts Lucide-style className for sizing (e.g. "h-4 w-4").
 */
export function CustomIcon({
  filename,
  className,
}: CustomIconProps): React.JSX.Element {
  const [svg, setSvg] = useState<string | null>(() => {
    const path = resolveIconPath(filename);
    return svgCache.get(path) ?? null;
  });

  useEffect(() => {
    let cancelled = false;

    loadSvg(filename)
      .then((content) => {
        if (!cancelled) setSvg(content);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });

    return () => {
      cancelled = true;
    };
  }, [filename]);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 [&_svg]:h-full [&_svg]:w-full",
        className,
      )}
      aria-hidden
      {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})}
    />
  );
}
