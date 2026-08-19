"use client";

import * as React from "react";

import type { BusinessTool } from "@/lib/onboarding/business-tools";
import { getToolLogoUrl, hasToolLogo } from "@/lib/onboarding/tool-logos.generated";
import { cn } from "@/lib/utils";

/**
 * Tools whose catalog entry is a concept rather than a vendor, so no brand mark
 * exists and initials would read as noise.
 */
const ICON_OVERRIDES: Record<
  string,
  React.ComponentType<{ className?: string }> | undefined
> = {};

/** Splits a product name into at most two display initials. */
function toInitials(name: string): string {
  const words = name.split(/[\s.]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  const word = words[0] ?? "?";
  return word.length > 1 ? `${word[0].toUpperCase()}${word[1].toLowerCase()}` : word.toUpperCase();
}

/** Returns true when white text is more legible than black on a brand colour. */
function prefersLightText(hex: string): boolean {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;
  if (full.length !== 6) return true;
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance < 0.45;
}

interface ToolLogoProps {
  tool: BusinessTool;
  className?: string;
}

/**
 * Renders a tool's brand mark, falling back to a brand-tinted monogram.
 *
 * Logo assets are committed under `public/assets/tool-logos/` and always sit on
 * a light tile: many vendor marks are dark-on-transparent or white-on-
 * transparent, so a fixed light ground is the only way both stay legible in the
 * dark theme.
 */
export const ToolLogo = React.memo(function ToolLogo({ tool, className }: ToolLogoProps) {
  const OverrideIcon = ICON_OVERRIDES[tool.id];

  if (OverrideIcon) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground",
          className,
        )}
      >
        <OverrideIcon className="size-5" />
      </span>
    );
  }

  if (hasToolLogo(tool.id)) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-white p-1.5",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local static SVG, no optimizer benefit */}
        <img
          src={getToolLogoUrl(tool.id)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border border-black/10 text-xs font-semibold tracking-tight",
        className,
      )}
      style={{
        backgroundColor: tool.brandColor,
        color: prefersLightText(tool.brandColor) ? "#FFFFFF" : "#111111",
      }}
    >
      {toInitials(tool.name)}
    </span>
  );
});
