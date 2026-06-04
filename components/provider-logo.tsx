"use client";

import * as React from "react";
import { Apple, LmStudio, Ollama } from "@lobehub/icons";

import { cn } from "@/lib/utils";

export interface ProviderLogoProps {
  providerId: string;
  className?: string;
  alt?: string;
}

const LOCAL_PROVIDER_ICONS = {
  ollama: Ollama,
  lmstudio: LmStudio,
  mlx: Apple,
} satisfies Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>;

/** Renders provider logos from models.dev, which serves a default logo when absent. */
export function ProviderLogo({ providerId, className, alt }: ProviderLogoProps) {
  const LocalIcon = LOCAL_PROVIDER_ICONS[providerId as keyof typeof LOCAL_PROVIDER_ICONS];

  if (LocalIcon) {
    return (
      <LocalIcon
        role="img"
        aria-label={alt ?? `${providerId} logo`}
        className={cn("h-4 w-4 shrink-0 text-foreground", className)}
      />
    );
  }

  const logoUrl = `https://models.dev/logos/${encodeURIComponent(providerId)}.svg`;

  return (
    <span
      role="img"
      aria-label={alt ?? `${providerId} logo`}
      className={cn("inline-block h-4 w-4 shrink-0 bg-current text-foreground", className)}
      style={{
        WebkitMaskImage: `url(${logoUrl})`,
        maskImage: `url(${logoUrl})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
