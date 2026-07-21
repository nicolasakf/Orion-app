import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const ORION_LOGO_SRC = {
  dark: "/assets/Orion%20Logo_White.svg",
  light: "/assets/Orion%20Logo_Black.svg",
} as const;

type OrionLoaderProps = ComponentPropsWithoutRef<"span">;

/** Renders the Orion mark with the shared loading pulse animation. */
export function OrionLoader({ className, ...props }: OrionLoaderProps) {
  return (
    <span
      className={cn("orion-loader-pulse inline-block shrink-0", className)}
      {...props}
    >
      <img
        src={ORION_LOGO_SRC.light}
        alt=""
        className="h-full w-full object-contain dark:hidden"
        draggable={false}
      />
      <img
        src={ORION_LOGO_SRC.dark}
        alt=""
        className="hidden h-full w-full object-contain dark:block"
        draggable={false}
      />
    </span>
  );
}
