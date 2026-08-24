"use client";

import { Plus, RotateCcw, X } from "lucide-react";

import { BoundedNumberInput } from "@/components/ui/bounded-number-input";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/common/color-picker";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SettingsInfoLabel,
} from "@/components/settings-dialog/settings-info-label";

interface SettingsNumberInputProps {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  className?: string;
  onChange: (value: number) => void;
}

/** Numeric settings control with range feedback. */
export function SettingsNumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  integer = true,
  className,
  onChange,
}: SettingsNumberInputProps) {
  return (
    <BoundedNumberInput
      id={id}
      min={min}
      max={max}
      step={step}
      integer={integer}
      value={value}
      className={className}
      onValueChange={onChange}
    />
  );
}

interface SettingsNumberFieldProps {
  id: string;
  label: string;
  description?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  onChange: (value: number) => void;
}

/** Numeric settings input with range feedback. */
export function SettingsNumberField({
  id,
  label,
  description,
  value,
  min,
  max,
  step = 1,
  integer = true,
  onChange,
}: SettingsNumberFieldProps) {
  return (
    <div className="space-y-2">
      <SettingsInfoLabel htmlFor={id} label={label} description={description} />
      <SettingsNumberInput
        id={id}
        min={min}
        max={max}
        step={step}
        integer={integer}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

interface SettingsTextFieldProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

/** Single-line text settings input. */
export function SettingsTextField({
  id,
  label,
  description,
  value,
  placeholder,
  onChange,
}: SettingsTextFieldProps) {
  return (
    <div className="space-y-2">
      <SettingsInfoLabel htmlFor={id} label={label} description={description} />
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

interface SettingsTextareaFieldProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  rows?: number;
  monospace?: boolean;
  onChange: (value: string) => void;
}

/** Multi-line text settings input. */
export function SettingsTextareaField({
  id,
  label,
  description,
  value,
  placeholder,
  rows = 4,
  monospace = false,
  onChange,
}: SettingsTextareaFieldProps) {
  return (
    <div className="space-y-2">
      <SettingsInfoLabel htmlFor={id} label={label} description={description} />
      <Textarea
        id={id}
        value={value}
        placeholder={placeholder}
        rows={rows}
        className={monospace ? "font-mono text-xs" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

interface SettingsSwitchFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Toggle row for boolean settings. */
export function SettingsSwitchField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: SettingsSwitchFieldProps) {
  return (
    <div className="corner-squircle flex items-center justify-between rounded-md border p-3">
      <SettingsInfoLabel htmlFor={id} label={label} description={description} />
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

interface SettingsColorFieldProps {
  id: string;
  label: string;
  description?: string;
  value: string | null;
  /** When true, users can clear the color to use default styling. */
  allowDefault?: boolean;
  defaultLabel?: string;
  onChange: (value: string | null) => void;
}

/** Single-color settings control backed by the shared color picker. */
export function SettingsColorField({
  id,
  label,
  description,
  value,
  allowDefault = false,
  defaultLabel = "Default",
  onChange,
}: SettingsColorFieldProps) {
  return (
    <div className="space-y-2">
      <SettingsInfoLabel htmlFor={id} label={label} description={description} />
      <div className="flex flex-wrap items-center gap-2">
        {value === null && allowDefault ? (
          <>
            <div
              id={id}
              className="inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-xs text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-sm border border-black/15 bg-muted shadow-inner dark:border-white/20"
              />
              <span>{defaultLabel}</span>
            </div>
            <ColorPicker
              showValue={false}
              defaultValue="#3B82F6"
              onValueChange={onChange}
              aria-label={`Choose ${label}`}
              className="h-9 w-9 px-0"
            />
          </>
        ) : (
          <ColorPicker
            id={id}
            value={value ?? "#3B82F6"}
            onValueChange={(nextColor) => onChange(nextColor)}
            aria-label={label}
          />
        )}
        {allowDefault && value !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            {defaultLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface SettingsColorListFieldProps {
  id: string;
  label: string;
  description?: string;
  values: string[];
  defaultValues?: readonly string[];
  minColors?: number;
  onChange: (values: string[]) => void;
}

/** Ordered list of colors for palette-style settings. */
export function SettingsColorListField({
  id,
  label,
  description,
  values,
  defaultValues,
  minColors = 1,
  onChange,
}: SettingsColorListFieldProps) {
  const updateColorAtIndex = (index: number, nextColor: string) => {
    onChange(values.map((color, colorIndex) => (colorIndex === index ? nextColor : color)));
  };

  const removeColorAtIndex = (index: number) => {
    if (values.length <= minColors) return;
    onChange(values.filter((_, colorIndex) => colorIndex !== index));
  };

  return (
    <div className="space-y-2">
      <SettingsInfoLabel htmlFor={id} label={label} description={description} />
      <div id={id} className="flex flex-wrap items-center gap-2">
        {values.map((color, index) => (
          <div key={`${id}-${index}`} className="flex items-center gap-1">
            <ColorPicker
              value={color}
              showValue={false}
              onValueChange={(nextColor) => updateColorAtIndex(index, nextColor)}
              aria-label={`${label} ${index + 1}`}
            />
            {values.length > minColors ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={`Remove ${label} ${index + 1}`}
                onClick={() => removeColorAtIndex(index)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label={`Add ${label}`}
          onClick={() => onChange([...values, values.at(-1) ?? "#3B82F6"])}
        >
          <Plus className="h-4 w-4" />
        </Button>
        {defaultValues ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => onChange([...defaultValues])}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset palette
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Parses newline-separated list values, dropping empty lines. */
export function parseLineList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Serializes string arrays as one item per line for textarea editing. */
export function formatLineList(values: readonly string[]): string {
  return values.join("\n");
}
