import type { InteractionModeConfig } from "@/lib/agent/interaction-modes";
import type { CSSProperties } from "react";

/** Visual styling for a mode in the chat selector. */
export interface InteractionModeColorStyle {
  /** null means use Orion's default muted selector styling. */
  color: string | null;
  triggerClassName: string;
  iconClassName: string;
  triggerStyle?: CSSProperties;
  iconStyle?: CSSProperties;
}

const DEFAULT_TRIGGER_CLASSNAME = "bg-muted hover:bg-accent";
const DEFAULT_ICON_CLASSNAME = "opacity-70";

/** Builds trigger and icon styling from a selector hex color. */
export function getInteractionModeColorStyle(
  color: string | null,
): InteractionModeColorStyle {
  if (!color) {
    return {
      color: null,
      triggerClassName: DEFAULT_TRIGGER_CLASSNAME,
      iconClassName: DEFAULT_ICON_CLASSNAME,
    };
  }

  return {
    color,
    triggerClassName:
      "hover:[background-color:color-mix(in_srgb,var(--mode-color)_15%,transparent)]",
    iconClassName: "",
    triggerStyle: {
      "--mode-color": color,
      backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
    } as CSSProperties,
    iconStyle: { color },
  };
}

/** Returns selector styling for a resolved interaction mode configuration. */
export function getInteractionModeColors(
  mode: InteractionModeConfig | undefined,
): InteractionModeColorStyle {
  return getInteractionModeColorStyle(mode?.selectorColor ?? null);
}
