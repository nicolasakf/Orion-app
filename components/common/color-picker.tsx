"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { normalizeHexColor } from "@/lib/color/hex";
import { cn } from "@/lib/utils";

const DEFAULT_COLOR = "#3B82F6";

export const DEFAULT_COLOR_PRESETS = [
  "#FFFFFF",
  "#A3A3A3",
  "#171717",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#06B6D4",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#D946EF",
  "#EC4899",
] as const;

interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export interface ColorPickerProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "defaultValue" | "onChange" | "value"
  > {
  /** Controlled color value in three- or six-digit hex notation. */
  value?: string;
  /** Initial color used when the picker is uncontrolled. */
  defaultValue?: string;
  /** Called with a normalized, uppercase six-digit hex value. */
  onValueChange?: (value: string) => void;
  /** Preset colors shown below the hex field. Pass an empty array to hide them. */
  presets?: readonly string[];
  /** Whether the trigger displays the current hex value next to its swatch. */
  showValue?: boolean;
  /** Controlled popover visibility. */
  open?: boolean;
  /** Called whenever the popover visibility changes. */
  onOpenChange?: (open: boolean) => void;
  /** Alignment of the picker relative to its trigger. */
  align?: React.ComponentPropsWithoutRef<typeof PopoverContent>["align"];
  /** Side on which the picker opens. */
  side?: React.ComponentPropsWithoutRef<typeof PopoverContent>["side"];
  /** Additional classes for the popover panel. */
  contentClassName?: string;
  /** Optional custom trigger rendered in place of the default swatch button. */
  trigger?: React.ReactElement;
}

/** Restricts a number to the inclusive range from zero to one. */
function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Converts a normalized hex color to hue, saturation, and value channels. */
function hexToHsv(hex: string): HsvColor {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

/** Converts hue, saturation, and value channels to normalized hex notation. */
function hsvToHex({ h, s, v }: HsvColor): string {
  const chroma = v * s;
  const hueSegment = ((h % 360) + 360) % 360 / 60;
  const secondary = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  const offset = v - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSegment < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSegment < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSegment < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSegment < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSegment < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const channelToHex = (channel: number) =>
    Math.round((channel + offset) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
}

/**
 * Shadcn-style hex color picker with an accessible trigger, visual color field,
 * hue control, direct input, and optional presets.
 */
export function ColorPicker({
  value,
  defaultValue = DEFAULT_COLOR,
  onValueChange,
  presets = DEFAULT_COLOR_PRESETS,
  showValue = true,
  open,
  onOpenChange,
  align = "start",
  side = "bottom",
  contentClassName,
  trigger,
  className,
  disabled,
  "aria-label": ariaLabel = "Choose color",
  ...buttonProps
}: ColorPickerProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    () => normalizeHexColor(defaultValue) ?? DEFAULT_COLOR,
  );
  const color = isControlled
    ? normalizeHexColor(value) ?? DEFAULT_COLOR
    : uncontrolledValue;
  const parsedColor = React.useMemo(() => hexToHsv(color), [color]);
  const [hue, setHue] = React.useState(parsedColor.h);
  const [hexInput, setHexInput] = React.useState(color);

  React.useEffect(() => {
    setHexInput(color);
    if (parsedColor.s > 0) setHue(parsedColor.h);
  }, [color, parsedColor.h, parsedColor.s]);

  const selectedColor = React.useMemo(
    () => ({ ...parsedColor, h: hue }),
    [hue, parsedColor],
  );
  const normalizedPresets = React.useMemo(
    () =>
      presets
        .map((preset) => normalizeHexColor(preset))
        .filter((preset): preset is string => preset !== null),
    [presets],
  );

  /** Applies a valid color to uncontrolled state and notifies the consumer. */
  const commitColor = React.useCallback(
    (nextColor: string) => {
      const normalized = normalizeHexColor(nextColor);
      if (!normalized || normalized === color) return;
      if (!isControlled) setUncontrolledValue(normalized);
      onValueChange?.(normalized);
    },
    [color, isControlled, onValueChange],
  );

  /** Applies HSV changes while retaining hue for black and grayscale colors. */
  const commitHsv = React.useCallback(
    (nextColor: HsvColor) => {
      setHue(nextColor.h);
      commitColor(hsvToHex(nextColor));
    },
    [commitColor],
  );

  /** Maps a pointer position within the color field to saturation and value. */
  const updateFromPointer = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;

      commitHsv({
        h: hue,
        s: clampUnit((event.clientX - bounds.left) / bounds.width),
        v: clampUnit(1 - (event.clientY - bounds.top) / bounds.height),
      });
    },
    [commitHsv, hue],
  );

  /** Begins pointer capture so dragging can continue outside the color field. */
  const handleSaturationPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromPointer(event);
    },
    [updateFromPointer],
  );

  /** Updates the color while a captured pointer moves across the color field. */
  const handleSaturationPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        updateFromPointer(event);
      }
    },
    [updateFromPointer],
  );

  /** Supports two-dimensional color field changes from the keyboard. */
  const handleSaturationKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      let nextSaturation = selectedColor.s;
      let nextValue = selectedColor.v;

      switch (event.key) {
        case "ArrowLeft":
          nextSaturation -= step;
          break;
        case "ArrowRight":
          nextSaturation += step;
          break;
        case "ArrowDown":
          nextValue -= step;
          break;
        case "ArrowUp":
          nextValue += step;
          break;
        default:
          return;
      }

      event.preventDefault();
      commitHsv({
        h: hue,
        s: clampUnit(nextSaturation),
        v: clampUnit(nextValue),
      });
    },
    [commitHsv, hue, selectedColor.s, selectedColor.v],
  );

  /** Keeps incomplete text local and commits complete six-digit hex values. */
  const handleHexChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextInput = event.target.value;
      setHexInput(nextInput);
      if (/^#[\da-f]{6}$/i.test(nextInput)) commitColor(nextInput);
    },
    [commitColor],
  );

  /** Normalizes shorthand input on blur or restores the active color. */
  const handleHexBlur = React.useCallback(() => {
    const normalized = normalizeHexColor(hexInput);
    if (normalized) {
      commitColor(normalized);
      setHexInput(normalized);
      return;
    }
    setHexInput(color);
  }, [color, commitColor, hexInput]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "h-9 justify-start gap-2 px-2.5 font-mono text-xs",
              !showValue && "w-9 px-0",
              className,
            )}
            {...buttonProps}
          >
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-sm border border-black/15 shadow-inner dark:border-white/20"
              style={{ backgroundColor: color }}
            />
            {showValue && <span>{color}</span>}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className={cn("w-64 space-y-3 p-3", contentClassName)}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label="Saturation and brightness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(selectedColor.s * 100)}
          aria-valuetext={`${Math.round(selectedColor.s * 100)}% saturation, ${Math.round(selectedColor.v * 100)}% brightness`}
          className="relative h-36 touch-none cursor-crosshair overflow-hidden rounded-md bg-[linear-gradient(to_bottom,transparent,#000),linear-gradient(to_right,#fff,transparent)] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ backgroundColor: `hsl(${hue} 100% 50%)` }}
          onPointerDown={handleSaturationPointerDown}
          onPointerMove={handleSaturationPointerMove}
          onKeyDown={handleSaturationKeyDown}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
            style={{
              left: `${selectedColor.s * 100}%`,
              top: `${(1 - selectedColor.v) * 100}%`,
              backgroundColor: color,
            }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(hue)}
          aria-label="Hue"
          className="h-3 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.35)] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          onChange={(event) => {
            const nextHue = Number(event.target.value);
            commitHsv({ ...selectedColor, h: nextHue });
          }}
        />

        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-8 shrink-0 rounded-md border border-black/15 shadow-inner dark:border-white/20"
            style={{ backgroundColor: color }}
          />
          <div className="flex min-w-0 flex-1 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <span className="pl-2 text-xs font-medium text-muted-foreground">
              Hex
            </span>
            <Input
              value={hexInput}
              aria-label="Hex color"
              aria-invalid={normalizeHexColor(hexInput) === null}
              maxLength={7}
              spellCheck={false}
              className="h-8 border-0 px-2 font-mono text-xs uppercase shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              onChange={handleHexChange}
              onBlur={handleHexBlur}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </div>
        </div>

        {normalizedPresets.length > 0 && (
          <div className="grid grid-cols-7 gap-1.5" aria-label="Preset colors">
            {normalizedPresets.map((preset, index) => (
              <button
                key={`${preset}-${index}`}
                type="button"
                aria-label={`Use color ${preset}`}
                aria-pressed={preset === color}
                className="aspect-square rounded-sm border border-black/15 shadow-sm outline-none ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-white/20"
                style={{ backgroundColor: preset }}
                onClick={() => commitColor(preset)}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
