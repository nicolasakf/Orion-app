"use client";

import * as React from "react";

import { ColorPicker, type ColorPickerProps } from "@/components/common/color-picker";
import { normalizeHexColor } from "@/lib/color/hex";
import { cn } from "@/lib/utils";

const DEFAULT_PALETTE = [
  "#780000",
  "#C1121F",
  "#FDF0D5",
  "#003049",
  "#669BBC",
] as const;

type PalettePickerProps = Pick<
  ColorPickerProps,
  "align" | "contentClassName" | "presets" | "side"
>;

export interface PaletteProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  /** Controlled list of colors in three- or six-digit hex notation. */
  value?: readonly string[];
  /** Initial colors used when the palette is uncontrolled. */
  defaultValue?: readonly string[];
  /** Called with the full palette after a swatch color changes. */
  onValueChange?: (colors: string[]) => void;
  /** Optional palette name displayed beneath the connected swatches. */
  label?: string;
  /** Prevents every swatch from opening its color picker. */
  disabled?: boolean;
  /** Options forwarded to each swatch's color picker panel. */
  pickerProps?: PalettePickerProps;
}

/** Normalizes a palette while retaining the number and order of its colors. */
function normalizePalette(colors: readonly string[]): string[] {
  return colors.map((color) => normalizeHexColor(color) ?? "#000000");
}

/** Chooses readable black or white text for a hex background. */
function getContrastColor(hex: string): "#FFFFFF" | "#171717" {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.6 ? "#171717" : "#FFFFFF";
}

/**
 * Connected, Coolors-inspired color swatches. Selecting a swatch opens the
 * shared color picker and reports the updated palette as a single value.
 */
export function Palette({
  value,
  defaultValue = DEFAULT_PALETTE,
  onValueChange,
  label,
  disabled = false,
  pickerProps,
  className,
  "aria-label": ariaLabel = label ? `${label} palette` : "Color palette",
  ...props
}: PaletteProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
    normalizePalette(defaultValue),
  );
  const colors = React.useMemo(
    () => (isControlled ? normalizePalette(value) : uncontrolledValue),
    [isControlled, uncontrolledValue, value],
  );
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  /** Replaces one swatch without mutating the consumer's color array. */
  const updateColor = React.useCallback(
    (index: number, color: string) => {
      const nextColors = colors.map((currentColor, currentIndex) =>
        currentIndex === index ? color : currentColor,
      );
      if (!isControlled) setUncontrolledValue(nextColors);
      onValueChange?.(nextColors);
    },
    [colors, isControlled, onValueChange],
  );

  return (
    <div
      role="group"
      className={cn("min-w-0", className)}
      aria-label={ariaLabel}
      {...props}
    >
      <div className="corner-squircle flex h-24 w-full overflow-hidden rounded-lg border border-black/10 shadow-sm dark:border-white/10">
        {colors.length === 0 ? (
          <div className="flex flex-1 items-center justify-center bg-muted px-4 text-xs text-muted-foreground">
            No colors
          </div>
        ) : (
          colors.map((color, index) => {
            const isActive = activeIndex === index;
            return (
              <ColorPicker
                key={index}
                {...pickerProps}
                value={color}
                disabled={disabled}
                open={isActive}
                onOpenChange={(open) => setActiveIndex(open ? index : null)}
                onValueChange={(nextColor) => updateColor(index, nextColor)}
                trigger={
                  <button
                    type="button"
                    aria-label={`Edit color ${color}`}
                    className={cn(
                      "group/swatch relative min-w-0 basis-0 grow overflow-hidden outline-none transition-[flex-grow] duration-200 ease-out focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      !disabled && "hover:grow-[2.25] focus:grow-[2.25]",
                      isActive && "grow-[2.25]",
                    )}
                    style={{ backgroundColor: color, color: getContrastColor(color) }}
                  >
                    <span
                      className={cn(
                        "absolute inset-x-1 bottom-3 translate-y-1 truncate font-mono text-[11px] font-semibold opacity-0 transition-all duration-200 group-hover/swatch:translate-y-0 group-hover/swatch:opacity-100 group-focus/swatch:translate-y-0 group-focus/swatch:opacity-100",
                        isActive && "translate-y-0 opacity-100",
                      )}
                    >
                      {color.slice(1)}
                    </span>
                  </button>
                }
              />
            );
          })
        )}
      </div>
      {label && (
        <p className="mt-2 truncate px-1 text-sm font-medium text-foreground">
          {label}
        </p>
      )}
    </div>
  );
}
