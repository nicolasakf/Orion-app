"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SettingsInfoLabel,
} from "@/components/settings-dialog/settings-info-label";

interface SettingsNumberFieldProps {
  id: string;
  label: string;
  description?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

/** Numeric settings input with optional clamping via min/max. */
export function SettingsNumberField({
  id,
  label,
  description,
  value,
  min,
  max,
  step = 1,
  onChange,
}: SettingsNumberFieldProps) {
  return (
    <div className="space-y-2">
      <SettingsInfoLabel htmlFor={id} label={label} description={description} />
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          let clamped = next;
          if (min !== undefined) clamped = Math.max(min, clamped);
          if (max !== undefined) clamped = Math.min(max, clamped);
          onChange(clamped);
        }}
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
