"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip";

interface BoundedNumberInputProps {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  className?: string;
  onValueChange: (value: number) => void;
}

/** Returns a finite number for complete numeric input and null while it is incomplete. */
function parseNumberInput(value: string): number | null {
  if (value.trim() === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Describes the numeric bounds shown when a value falls outside them. */
function formatAcceptedRange(
  min?: number,
  max?: number,
  integer?: boolean,
): string {
  const range = `Accepted range: ${min ?? "−∞"} – ${max ?? "∞"}`;
  return integer ? `Whole numbers only. ${range}` : range;
}

/**
 * A numeric control that preserves the user's in-progress value.
 *
 * Valid values are reported immediately. Out-of-range values remain editable,
 * are highlighted, and are not reported until they fall within the accepted range.
 */
export function BoundedNumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  integer = false,
  className,
  onValueChange,
}: BoundedNumberInputProps) {
  const [inputValue, setInputValue] = useState(String(value));
  const parsedValue = parseNumberInput(inputValue);
  const isFractional =
    integer && parsedValue !== null && !Number.isInteger(parsedValue);
  const isOutOfRange =
    parsedValue !== null &&
    ((min !== undefined && parsedValue < min) ||
      (max !== undefined && parsedValue > max));
  const isInvalid = isFractional || isOutOfRange;

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  return (
    <Tooltip open={isInvalid}>
      <TooltipTrigger asChild>
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={inputValue}
          aria-invalid={isInvalid}
          className={cn(
            isInvalid && "border-destructive focus-visible:ring-destructive",
            className
          )}
          onChange={(event) => {
            const nextInputValue = event.target.value;
            const nextValue = parseNumberInput(nextInputValue);
            setInputValue(nextInputValue);

            if (
              nextValue === null ||
              (integer && !Number.isInteger(nextValue)) ||
              (min !== undefined && nextValue < min) ||
              (max !== undefined && nextValue > max)
            ) {
              return;
            }

            onValueChange(nextValue);
          }}
        />
      </TooltipTrigger>
      {isInvalid ? (
        <TooltipContent
          side="top"
          className="border-destructive bg-destructive text-destructive-foreground text-xs"
        >
          {formatAcceptedRange(min, max, integer)}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
