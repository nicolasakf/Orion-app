"use client";

import { BoundedNumberInput } from "@/components/ui/bounded-number-input";
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
