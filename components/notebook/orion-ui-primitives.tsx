"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NotebookAppViewSchemaNode } from "@/lib/notebook/app-view";
import { cn } from "@/lib/utils";

export type OrionUiLocalValue = string | number | boolean;

export interface OrionUiRenderCallbacks {
  onStateChange?: (key: string, value: OrionUiLocalValue) => void;
  onAction?: (action: unknown) => void;
  renderMarkdownReference?: (
    cellId: string | undefined,
    fallbackSource: string | undefined,
  ) => React.ReactNode;
  renderOutputReference?: (
    cellId: string | undefined,
    outputIndex: number,
  ) => React.ReactNode;
}

interface OrionUiPrimitiveTreeProps {
  root: NotebookAppViewSchemaNode;
  initialState?: Record<string, OrionUiLocalValue>;
  callbacks?: OrionUiRenderCallbacks;
  className?: string;
}

type PrimitiveRenderer = (
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
) => React.ReactNode;

interface SchemaRenderContext {
  state: Record<string, OrionUiLocalValue>;
  setStateValue: (key: string, value: OrionUiLocalValue) => void;
  callbacks: OrionUiRenderCallbacks;
  renderNode: (node: NotebookAppViewSchemaNode) => React.ReactNode;
  renderChildren: (node: NotebookAppViewSchemaNode) => React.ReactNode;
}

interface SelectOption {
  label: string;
  value: string;
}

interface DatePreset {
  label: string;
  value?: string;
  from?: string;
  to?: string;
  daysOffset?: number;
  fromDaysOffset?: number;
  toDaysOffset?: number;
}

type CalendarCaptionLayout = "buttons" | "dropdown" | "dropdown-buttons";
type DateSelectionMode = "single" | "range";

const gapClasses = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
} as const;

const paddingClasses = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
} as const;

const alignClasses = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
} as const;

const gridColumnClasses = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
} as const;

const builtinPrimitiveRenderers: Record<string, PrimitiveRenderer> = {
  Page: renderPage,
  Stack: renderStack,
  Grid: renderGrid,
  Section: renderSection,
  Card: renderCard,
  Tabs: renderTabs,
  MarkdownCell: renderMarkdownCell,
  Output: renderOutput,
  Button: renderButton,
  Input: renderInput,
  Textarea: renderTextarea,
  Select: renderSelect,
  Slider: renderSlider,
  Checkbox: renderCheckbox,
  Switch: renderSwitch,
  RadioGroup: renderRadioGroup,
  Toggle: renderToggle,
  ToggleGroup: renderToggleGroup,
  Calendar: renderCalendar,
  DatePicker: renderDatePicker,
  DateTimePicker: renderDateTimePicker,
  Label: renderLabel,
  Badge: renderBadge,
  Separator: renderSeparator,
  Alert: renderAlert,
  Progress: renderProgress,
  Avatar: renderAvatar,
  Popover: renderPopover,
  HoverCard: renderHoverCard,
  Tooltip: renderTooltip,
  Carousel: renderCarousel,
  Collapsible: renderCollapsible,
  Accordion: renderAccordion,
};

/** Returns a string prop from a schema node when present. */
function stringProp(
  props: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = props[key];
  return typeof value === "string" ? value : undefined;
}

/** Merges a primitive's schema class hook with renderer-owned classes. */
function primitiveClass(
  node: NotebookAppViewSchemaNode,
  ...classes: Array<string | false | null | undefined>
): string | undefined {
  return cn(...classes, stringProp(node.props, "className"));
}

/** Returns a finite numeric prop from a schema node when present. */
function numberProp(
  props: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Returns a boolean prop from a schema node when present. */
function booleanProp(
  props: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = props[key];
  return typeof value === "boolean" ? value : undefined;
}

/** Normalizes compact spacing names to stable Tailwind classes. */
function spacingClass(
  value: unknown,
  classes: typeof gapClasses | typeof paddingClasses,
): string {
  return typeof value === "string" && value in classes
    ? classes[value as keyof typeof classes]
    : classes.md;
}

/** Normalizes alignment names to stable Tailwind classes. */
function alignClass(value: unknown): string {
  return typeof value === "string" && value in alignClasses
    ? alignClasses[value as keyof typeof alignClasses]
    : alignClasses.stretch;
}

/** Converts string/object option metadata to select-ready options. */
function getOptions(props: Record<string, unknown>): SelectOption[] {
  const options = props.options;
  if (!Array.isArray(options)) {
    return [];
  }

  return options.flatMap((option) => {
    if (typeof option === "string") {
      return [{ label: option, value: option }];
    }

    if (!option || typeof option !== "object" || Array.isArray(option)) {
      return [];
    }

    const record = option as Record<string, unknown>;
    const value = stringProp(record, "value");
    const label = stringProp(record, "label") ?? value;
    return value && label ? [{ label, value }] : [];
  });
}

/** Converts date preset schema entries to clickable preset buttons. */
function getDatePresets(props: Record<string, unknown>): DatePreset[] {
  const presets = props.presets;
  if (!Array.isArray(presets)) {
    return [];
  }

  return presets.flatMap((preset) => {
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
      return [];
    }

    const record = preset as Record<string, unknown>;
    const label = stringProp(record, "label");
    if (!label) {
      return [];
    }

    return [
      {
        label,
        value: stringProp(record, "value"),
        from: stringProp(record, "from"),
        to: stringProp(record, "to"),
        daysOffset: numberProp(record, "daysOffset"),
        fromDaysOffset: numberProp(record, "fromDaysOffset"),
        toDaysOffset: numberProp(record, "toDaysOffset"),
      },
    ];
  });
}

/** Reads a local string value using the schema default when state is unset. */
function getStringState(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): string {
  const stateKey = stringProp(node.props, "stateKey");
  if (stateKey && typeof context.state[stateKey] === "string") {
    return context.state[stateKey] as string;
  }

  return stringProp(node.props, "defaultValue") ?? "";
}

/** Reads string state from a prop-named state key. */
function getStringStateByPropKey(
  props: Record<string, unknown>,
  context: SchemaRenderContext,
  keyProp: string,
  defaultProp: string,
): string {
  const stateKey = stringProp(props, keyProp);
  if (stateKey && typeof context.state[stateKey] === "string") {
    return context.state[stateKey] as string;
  }

  return stringProp(props, defaultProp) ?? "";
}

/** Reads a local boolean value using the schema default when state is unset. */
function getBooleanState(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): boolean {
  const stateKey = stringProp(node.props, "stateKey");
  if (stateKey && typeof context.state[stateKey] === "boolean") {
    return context.state[stateKey] as boolean;
  }

  return booleanProp(node.props, "defaultValue") ?? false;
}

/** Reads a local numeric value using the schema default when state is unset. */
function getNumberState(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): number {
  const stateKey = stringProp(node.props, "stateKey");
  if (stateKey && typeof context.state[stateKey] === "number") {
    return context.state[stateKey] as number;
  }

  return (
    numberProp(node.props, "defaultValue") ??
    numberProp(node.props, "min") ??
    0
  );
}

/** Writes local control state and forwards bound updates to Orion runtime hooks. */
function setNodeState(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
  value: OrionUiLocalValue,
): void {
  const stateKey = stringProp(node.props, "stateKey");
  if (!stateKey) {
    return;
  }

  context.setStateValue(stateKey, value);
  context.callbacks.onStateChange?.(stateKey, value);
}

/** Writes local state through a prop-named state key. */
function setStateByPropKey(
  props: Record<string, unknown>,
  context: SchemaRenderContext,
  keyProp: string,
  value: OrionUiLocalValue,
): void {
  const stateKey = stringProp(props, keyProp);
  if (!stateKey) {
    return;
  }

  context.setStateValue(stateKey, value);
  context.callbacks.onStateChange?.(stateKey, value);
}

/** Returns overlay trigger text from common schema prop names. */
function overlayTriggerText(props: Record<string, unknown>): string {
  return (
    stringProp(props, "label") ??
    stringProp(props, "trigger") ??
    stringProp(props, "text") ??
    "Open"
  );
}

/** Renders overlay body content from children or inline text props. */
function overlayBodyContent(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  if (node.children.length > 0) {
    return context.renderChildren(node);
  }

  const content =
    stringProp(node.props, "content") ?? stringProp(node.props, "description");
  return content ? <p className="text-sm">{content}</p> : null;
}

/** Parses an ISO-like YYYY-MM-DD string into a local Date. */
function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Formats a Date as an ISO-like YYYY-MM-DD string. */
function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Formats a stored date string for display in date controls. */
function formatDateLabel(value: string | undefined, placeholder: string): string {
  const parsed = parseIsoDate(value);
  return parsed ? format(parsed, "PPP") : placeholder;
}

/** Parses a stored JSON date range into DayPicker's DateRange shape. */
function parseDateRange(value: string | undefined): DateRange | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;
    const from =
      typeof record.from === "string" ? parseIsoDate(record.from) : undefined;
    const to =
      typeof record.to === "string" ? parseIsoDate(record.to) : undefined;
    return from || to ? { from, to } : undefined;
  } catch {
    return undefined;
  }
}

/** Formats DayPicker's DateRange shape as compact JSON string state. */
function formatDateRange(range: DateRange | undefined): string {
  if (!range?.from && !range?.to) {
    return "";
  }

  const value: { from?: string; to?: string } = {};
  if (range.from) {
    value.from = formatIsoDate(range.from);
  }
  if (range.to) {
    value.to = formatIsoDate(range.to);
  }
  return JSON.stringify(value);
}

/** Formats a stored range string for display in date picker triggers. */
function formatDateRangeLabel(
  value: string | undefined,
  placeholder: string,
): string {
  const range = parseDateRange(value);
  if (range?.from && range.to) {
    return `${format(range.from, "LLL dd, y")} - ${format(range.to, "LLL dd, y")}`;
  }
  if (range?.from) {
    return `${format(range.from, "LLL dd, y")} - ...`;
  }
  if (range?.to) {
    return `... - ${format(range.to, "LLL dd, y")}`;
  }
  return placeholder;
}

/** Returns the requested DayPicker selection mode. */
function dateSelectionMode(props: Record<string, unknown>): DateSelectionMode {
  return stringProp(props, "mode") === "range" ? "range" : "single";
}

/** Returns the requested DayPicker caption layout when supported. */
function calendarCaptionLayout(
  props: Record<string, unknown>,
): CalendarCaptionLayout | undefined {
  const value = stringProp(props, "captionLayout");
  if (value === "buttons") {
    return "buttons";
  }
  if (value === "dropdown") {
    return "dropdown";
  }
  if (value === "dropdown-buttons") {
    return "dropdown-buttons";
  }
  return undefined;
}

/** Returns whether days outside the current month should be shown. */
function calendarShowOutsideDays(props: Record<string, unknown>): boolean {
  return booleanProp(props, "showOutsideDays") ?? false;
}

/** Returns a positive month count for multi-month calendar layouts. */
function calendarNumberOfMonths(
  props: Record<string, unknown>,
): number | undefined {
  const value = numberProp(props, "numberOfMonths");
  return value && value > 0 ? Math.floor(value) : undefined;
}

/** DayPicker props for month count. Omit when unset — explicit undefined breaks rendering. */
function calendarMonthProps(
  props: Record<string, unknown>,
): { numberOfMonths?: number } {
  const numberOfMonths = calendarNumberOfMonths(props);
  return numberOfMonths ? { numberOfMonths } : {};
}

/** Formats a local date offset from today as YYYY-MM-DD. */
function formatDateOffset(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return formatIsoDate(date);
}

/** Returns a preset's single date value, if valid. */
function presetSingleValue(preset: DatePreset): string | undefined {
  if (preset.value && parseIsoDate(preset.value)) {
    return preset.value;
  }
  if (preset.daysOffset !== undefined) {
    return formatDateOffset(preset.daysOffset);
  }
  return undefined;
}

/** Returns a preset's range date value, if valid. */
function presetRangeValue(preset: DatePreset): string | undefined {
  const from =
    preset.from && parseIsoDate(preset.from)
      ? preset.from
      : preset.fromDaysOffset !== undefined
        ? formatDateOffset(preset.fromDaysOffset)
        : undefined;
  const to =
    preset.to && parseIsoDate(preset.to)
      ? preset.to
      : preset.toDaysOffset !== undefined
        ? formatDateOffset(preset.toDaysOffset)
        : undefined;

  if (from || to) {
    return JSON.stringify({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
  }

  const singleDate = presetSingleValue(preset);
  return singleDate
    ? JSON.stringify({ from: singleDate, to: singleDate })
    : undefined;
}

/** Returns the selected date that should anchor the currently visible calendar month. */
function selectedCalendarMonth(
  value: string | undefined,
  mode: DateSelectionMode,
): Date | undefined {
  if (mode === "range") {
    const range = parseDateRange(value);
    return range?.from ?? range?.to;
  }

  return parseIsoDate(value);
}

/** Returns whether two date objects point to the same month and year. */
function isSameCalendarMonth(
  left: Date | undefined,
  right: Date | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

/** Keeps visible month synced with selected value while allowing manual navigation. */
function CalendarWithSyncedMonth({
  monthAnchor,
  onMonthChange,
  children,
  ...props
}: React.ComponentProps<typeof Calendar> & {
  monthAnchor?: Date;
  children?: (syncMonth: (nextMonthAnchor: Date | undefined) => void) => React.ReactNode;
}): React.JSX.Element {
  const [visibleMonth, setVisibleMonth] = useState<Date | undefined>(() =>
    monthAnchor
      ? new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1)
      : undefined,
  );
  const monthAnchorYear = monthAnchor?.getFullYear();
  const monthAnchorIndex = monthAnchor?.getMonth();

  useEffect(() => {
    if (monthAnchorYear === undefined || monthAnchorIndex === undefined) {
      return;
    }

    const anchoredMonth = new Date(monthAnchorYear, monthAnchorIndex, 1);
    setVisibleMonth((currentMonth) =>
      isSameCalendarMonth(currentMonth, anchoredMonth)
        ? currentMonth
        : anchoredMonth,
    );
  }, [monthAnchorIndex, monthAnchorYear]);

  const syncMonth = useCallback((nextMonthAnchor: Date | undefined) => {
    if (!nextMonthAnchor) {
      return;
    }

    setVisibleMonth(
      new Date(nextMonthAnchor.getFullYear(), nextMonthAnchor.getMonth(), 1),
    );
  }, []);

  return (
    <>
      <Calendar
        {...props}
        month={visibleMonth}
        onMonthChange={(nextMonth) => {
          setVisibleMonth(nextMonth);
          onMonthChange?.(nextMonth);
        }}
      />
      {children?.(syncMonth)}
    </>
  );
}

/** Renders quick-pick date presets under a calendar. */
function renderDatePresets(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
  mode: DateSelectionMode,
  onPresetMonth?: (monthAnchor: Date | undefined) => void,
): React.ReactNode {
  const presets = getDatePresets(node.props);
  if (presets.length === 0) {
    return null;
  }

  return (
    <div className="w-full px-2 pb-2 pt-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => {
              const nextValue =
                mode === "range"
                  ? presetRangeValue(preset)
                  : presetSingleValue(preset);
              if (nextValue !== undefined) {
                setNodeState(node, context, nextValue);
                onPresetMonth?.(selectedCalendarMonth(nextValue, mode));
              }
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

const avatarSizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
} as const;

/** Renders a declarative Orion UI primitive tree. */
export function OrionUiPrimitiveTree({
  root,
  initialState,
  callbacks,
  className,
}: OrionUiPrimitiveTreeProps): React.JSX.Element {
  const [state, setState] = useState<Record<string, OrionUiLocalValue>>(
    initialState ?? {},
  );
  const initialStateSignature = JSON.stringify(initialState ?? {});

  useEffect(() => {
    setState(initialState ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStateSignature]);

  const setStateValue = useCallback((key: string, value: OrionUiLocalValue) => {
    setState((current) => ({ ...current, [key]: value }));
  }, []);

  const context = useMemo<SchemaRenderContext>(() => {
    const renderNode = (node: NotebookAppViewSchemaNode): React.ReactNode => {
      const renderer = builtinPrimitiveRenderers[node.type];
      return renderer ? renderer(node, context) : null;
    };

    const renderChildren = (node: NotebookAppViewSchemaNode): React.ReactNode =>
      node.children.map((child, index) => (
        <React.Fragment key={`${child.type}-${index}`}>
          {renderNode(child)}
        </React.Fragment>
      ));

    const context: SchemaRenderContext = {
      state,
      setStateValue,
      callbacks: callbacks ?? {},
      renderNode,
      renderChildren,
    };

    return context;
  }, [callbacks, setStateValue, state]);

  return (
    <div className={className}>
      <TooltipProvider delayDuration={300}>
        {context.renderNode(root)}
      </TooltipProvider>
    </div>
  );
}

/** Renders the top-level app page container. */
function renderPage(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-full w-full max-w-7xl flex-col",
        spacingClass(node.props.gap, gapClasses),
        spacingClass(node.props.padding, paddingClasses),
        stringProp(node.props, "className"),
      )}
    >
      {context.renderChildren(node)}
    </main>
  );
}

/** Renders a vertical stack of child primitives. */
function renderStack(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  return (
    <div
      className={cn(
        "flex flex-col",
        spacingClass(node.props.gap, gapClasses),
        alignClass(node.props.align),
        stringProp(node.props, "className"),
      )}
    >
      {context.renderChildren(node)}
    </div>
  );
}

/** Renders a constrained responsive grid of child primitives. */
function renderGrid(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const columns = Math.min(
    4,
    Math.max(1, Math.floor(numberProp(node.props, "columns") ?? 2)),
  );

  return (
    <div
      className={cn(
        "grid w-full",
        gridColumnClasses[columns as keyof typeof gridColumnClasses],
        spacingClass(node.props.gap, gapClasses),
        stringProp(node.props, "className"),
      )}
    >
      {context.renderChildren(node)}
    </div>
  );
}

/** Renders a section with optional title and description. */
function renderSection(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const title =
    stringProp(node.props, "title") ?? stringProp(node.props, "label");
  const description = stringProp(node.props, "description");

  return (
    <section
      className={primitiveClass(
        node,
        "w-full",
        spacingClass(node.props.padding, paddingClasses),
      )}
    >
      {title ? (
        <div className="mb-3">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn("flex flex-col", spacingClass(node.props.gap, gapClasses))}
      >
        {context.renderChildren(node)}
      </div>
    </section>
  );
}

/** Renders a shadcn card wrapper around child primitives. */
function renderCard(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const title = stringProp(node.props, "title");
  const description = stringProp(node.props, "description");

  return (
    <Card className={primitiveClass(node)}>
      {title || description ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent
        className={cn(
          !title && !description && "pt-6",
          "flex flex-col",
          spacingClass(node.props.gap, gapClasses),
        )}
      >
        {context.renderChildren(node)}
      </CardContent>
    </Card>
  );
}

/** Renders tabs using child nodes as tab panels. */
function renderTabs(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const tabs = node.children;
  const defaultValue =
    stringProp(node.props, "defaultValue") ??
    stringProp(tabs[0]?.props ?? {}, "value") ??
    "tab-0";

  return (
    <Tabs defaultValue={defaultValue} className={primitiveClass(node, "w-full")}>
      <TabsList>
        {tabs.map((tab, index) => {
          const value = stringProp(tab.props, "value") ?? `tab-${index}`;
          const label =
            stringProp(tab.props, "label") ??
            stringProp(tab.props, "title") ??
            value;
          return (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {tabs.map((tab, index) => {
        const value = stringProp(tab.props, "value") ?? `tab-${index}`;
        return (
          <TabsContent key={value} value={value}>
            {context.renderNode(tab)}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

/** Renders markdown from inline schema text or a referenced markdown cell. */
function renderMarkdownCell(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const cellId = stringProp(node.props, "cellId");
  const source =
    stringProp(node.props, "source") ?? stringProp(node.props, "text");
  const rendered = context.callbacks.renderMarkdownReference?.(cellId, source);
  if (rendered) {
    return <div className={primitiveClass(node)}>{rendered}</div>;
  }
  if (source) {
    return (
      <div className={primitiveClass(node)}>
        <MarkdownRenderer source={source} />
      </div>
    );
  }
  return (
    <div className={primitiveClass(node)}>
      <MissingReference
        label={cellId ? `Markdown cell '${cellId}'` : "Markdown source"}
      />
    </div>
  );
}

/** Renders a referenced notebook output by stable cell id and output index. */
function renderOutput(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const cellId = stringProp(node.props, "cellId");
  const outputIndex = Math.max(
    0,
    Math.floor(numberProp(node.props, "outputIndex") ?? 0),
  );
  return (
    <div className={primitiveClass(node)}>
      {context.callbacks.renderOutputReference?.(cellId, outputIndex) ?? (
        <MissingReference
          label={cellId ? `Output ${outputIndex} from '${cellId}'` : "Output"}
        />
      )}
    </div>
  );
}

/** Renders an optional action button for local UI composition. */
function renderButton(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const label =
    stringProp(node.props, "label") ??
    stringProp(node.props, "text") ??
    "Button";
  const variant = stringProp(node.props, "variant");
  const size = stringProp(node.props, "size");
  const action = node.props.action;

  return (
    <Button
      type="button"
      variant={
        variant === "secondary" ||
          variant === "outline" ||
          variant === "ghost" ||
          variant === "destructive"
          ? variant
          : "default"
      }
      size={size === "sm" || size === "lg" ? size : "default"}
      className={primitiveClass(node)}
      onClick={() => {
        if (action !== undefined) {
          context.callbacks.onAction?.(action);
        }
      }}
    >
      {label}
    </Button>
  );
}

/** Renders a local text input bound to renderer-local state. */
function renderInput(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  return (
    <Input
      type={stringProp(node.props, "inputType") ?? "text"}
      value={getStringState(node, context)}
      placeholder={stringProp(node.props, "placeholder")}
      className={primitiveClass(node)}
      aria-label={
        stringProp(node.props, "label") ??
        stringProp(node.props, "stateKey") ??
        "Input"
      }
      onChange={(event) => setNodeState(node, context, event.target.value)}
    />
  );
}

/** Renders a local textarea bound to renderer-local state. */
function renderTextarea(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  return (
    <Textarea
      value={getStringState(node, context)}
      placeholder={stringProp(node.props, "placeholder")}
      className={primitiveClass(node)}
      aria-label={
        stringProp(node.props, "label") ??
        stringProp(node.props, "stateKey") ??
        "Textarea"
      }
      onChange={(event) => setNodeState(node, context, event.target.value)}
    />
  );
}

/** Renders a local select bound to renderer-local state. */
function renderSelect(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const options = getOptions(node.props);
  const value = getStringState(node, context) || options[0]?.value || "";

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => setNodeState(node, context, nextValue)}
    >
      <SelectTrigger
        className={primitiveClass(node)}
        aria-label={
          stringProp(node.props, "label") ??
          stringProp(node.props, "stateKey") ??
          "Select"
        }
      >
        <SelectValue
          placeholder={stringProp(node.props, "placeholder") ?? "Select"}
        />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Renders a local slider bound to renderer-local state. */
function renderSlider(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const value = getNumberState(node, context);

  return (
    <Slider
      value={[value]}
      min={numberProp(node.props, "min") ?? 0}
      max={numberProp(node.props, "max") ?? 100}
      step={numberProp(node.props, "step") ?? 1}
      className={primitiveClass(node)}
      aria-label={
        stringProp(node.props, "label") ??
        stringProp(node.props, "stateKey") ??
        "Slider"
      }
      onValueChange={(nextValue) =>
        setNodeState(node, context, nextValue[0] ?? value)
      }
    />
  );
}

/** Renders a local checkbox bound to renderer-local state. */
function renderCheckbox(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const label = stringProp(node.props, "label");

  return (
    <label className={primitiveClass(node, "flex items-center gap-2 text-sm")}>
      <Checkbox
        checked={getBooleanState(node, context)}
        onCheckedChange={(checked) =>
          setNodeState(node, context, checked === true)
        }
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

/** Renders a local switch bound to renderer-local state. */
function renderSwitch(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const label = stringProp(node.props, "label");

  return (
    <label className={primitiveClass(node, "flex items-center gap-2 text-sm")}>
      <Switch
        checked={getBooleanState(node, context)}
        onCheckedChange={(checked) => setNodeState(node, context, checked)}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

/** Renders label text or child primitives inside a label element. */
function renderLabel(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const text = stringProp(node.props, "text") ?? stringProp(node.props, "label");

  return (
    <Label className={primitiveClass(node)}>
      {text ?? context.renderChildren(node)}
    </Label>
  );
}

/** Renders a small badge with constrained variants. */
function renderBadge(node: NotebookAppViewSchemaNode): React.ReactNode {
  const text =
    stringProp(node.props, "text") ?? stringProp(node.props, "label") ?? "";
  const variant = stringProp(node.props, "variant");

  return (
    <Badge
      className={primitiveClass(node)}
      variant={
        variant === "secondary" ||
          variant === "destructive" ||
          variant === "outline"
          ? variant
          : "default"
      }
    >
      {text}
    </Badge>
  );
}

/** Renders a horizontal separator. */
function renderSeparator(node: NotebookAppViewSchemaNode): React.ReactNode {
  return <Separator className={primitiveClass(node)} />;
}

/** Renders an inline alert with optional title and description. */
function renderAlert(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const title = stringProp(node.props, "title");
  const description =
    stringProp(node.props, "description") ?? stringProp(node.props, "text");
  const variant = stringProp(node.props, "variant");

  return (
    <Alert
      className={primitiveClass(node)}
      variant={variant === "destructive" ? "destructive" : "default"}
    >
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {description ? <AlertDescription>{description}</AlertDescription> : null}
      {node.children.length > 0 ? (
        <AlertDescription>{context.renderChildren(node)}</AlertDescription>
      ) : null}
    </Alert>
  );
}

/** Renders a numeric progress bar from bound or static values. */
function renderProgress(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const max = numberProp(node.props, "max") ?? 100;
  const rawValue = getNumberState(node, context);
  const value = Math.min(max, Math.max(0, rawValue));

  return (
    <Progress
      value={(value / max) * 100}
      className={primitiveClass(node)}
      aria-label={
        stringProp(node.props, "label") ??
        stringProp(node.props, "stateKey") ??
        "Progress"
      }
    />
  );
}

/** Renders an avatar image with optional fallback text. */
function renderAvatar(node: NotebookAppViewSchemaNode): React.ReactNode {
  const src = stringProp(node.props, "src");
  const alt = stringProp(node.props, "alt") ?? "";
  const fallback =
    stringProp(node.props, "fallback") ??
    stringProp(node.props, "label") ??
    "?";
  const size = stringProp(node.props, "size");
  const sizeClass =
    size === "sm" || size === "lg"
      ? avatarSizeClasses[size]
      : avatarSizeClasses.md;

  return (
    <Avatar className={primitiveClass(node, sizeClass)}>
      {src ? <AvatarImage src={src} alt={alt} /> : null}
      <AvatarFallback>{fallback.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

/** Renders a popover with a button trigger and child content. */
function renderPopover(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={primitiveClass(node)}>
          {overlayTriggerText(node.props)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">{overlayBodyContent(node, context)}</PopoverContent>
    </Popover>
  );
}

/** Renders a hover card with a text trigger and child content. */
function renderHoverCard(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="link"
          className={primitiveClass(node, "h-auto p-0")}
        >
          {overlayTriggerText(node.props)}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent>{overlayBodyContent(node, context)}</HoverCardContent>
    </HoverCard>
  );
}

/** Renders a tooltip around a button trigger. */
function renderTooltip(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const tooltipText =
    stringProp(node.props, "content") ??
    stringProp(node.props, "description") ??
    overlayTriggerText(node.props);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" className={primitiveClass(node)}>
          {overlayTriggerText(node.props)}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {node.children.length > 0 ? context.renderChildren(node) : tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

/** Renders a carousel whose children become slides. */
function renderCarousel(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const orientation =
    stringProp(node.props, "orientation") === "vertical"
      ? "vertical"
      : "horizontal";
  const showControls = booleanProp(node.props, "showControls") ?? true;

  return (
    <Carousel
      orientation={orientation}
      className={primitiveClass(node, "w-full max-w-full")}
    >
      <CarouselContent>
        {node.children.map((child, index) => (
          <CarouselItem key={`slide-${index}`}>
            {context.renderNode(child)}
          </CarouselItem>
        ))}
      </CarouselContent>
      {showControls ? (
        <>
          <CarouselPrevious />
          <CarouselNext />
        </>
      ) : null}
    </Carousel>
  );
}

/** Renders a collapsible section with a trigger label and child content. */
function renderCollapsible(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const defaultOpen = booleanProp(node.props, "defaultOpen") ?? false;

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={primitiveClass(node, "w-full")}
    >
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="px-0">
          {stringProp(node.props, "label") ??
            stringProp(node.props, "title") ??
            "Toggle"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {overlayBodyContent(node, context)}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Renders an accordion whose children become expandable items. */
function renderAccordion(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const items = node.children;
  const defaultValue =
    stringProp(node.props, "defaultValue") ??
    stringProp(items[0]?.props ?? {}, "value") ??
    "item-0";
  const multiple = booleanProp(node.props, "multiple") ?? false;

  const accordionItems = items.map((item, index) => {
    const value = stringProp(item.props, "value") ?? `item-${index}`;
    const label =
      stringProp(item.props, "label") ??
      stringProp(item.props, "title") ??
      value;
    return (
      <AccordionItem key={value} value={value}>
        <AccordionTrigger>{label}</AccordionTrigger>
        <AccordionContent>{context.renderNode(item)}</AccordionContent>
      </AccordionItem>
    );
  });

  if (multiple) {
    return (
      <Accordion
        type="multiple"
        defaultValue={[defaultValue]}
        className={primitiveClass(node, "w-full")}
      >
        {accordionItems}
      </Accordion>
    );
  }

  return (
    <Accordion
      type="single"
      defaultValue={defaultValue}
      className={primitiveClass(node, "w-full")}
    >
      {accordionItems}
    </Accordion>
  );
}

/** Renders a radio group bound to renderer-local string state. */
function renderRadioGroup(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const options = getOptions(node.props);
  const value = getStringState(node, context) || options[0]?.value || "";
  const label = stringProp(node.props, "label");

  return (
    <div className={primitiveClass(node, "flex flex-col gap-2")}>
      {label ? <Label>{label}</Label> : null}
      <RadioGroup
        value={value}
        onValueChange={(nextValue) => setNodeState(node, context, nextValue)}
        aria-label={
          label ?? stringProp(node.props, "stateKey") ?? "Radio group"
        }
      >
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <RadioGroupItem value={option.value} />
            <span>{option.label}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

/** Renders a boolean toggle bound to renderer-local state. */
function renderToggle(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const label =
    stringProp(node.props, "label") ??
    stringProp(node.props, "text") ??
    "Toggle";
  const variant = stringProp(node.props, "variant");
  const pressed = getBooleanState(node, context);

  return (
    <Toggle
      pressed={pressed}
      variant={variant === "outline" ? "outline" : "default"}
      className={primitiveClass(node)}
      aria-label={label}
      onPressedChange={(nextPressed) =>
        setNodeState(node, context, nextPressed)
      }
    >
      {label}
    </Toggle>
  );
}

/** Renders a toggle group bound to renderer-local string state. */
function renderToggleGroup(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const options = getOptions(node.props);
  const value = getStringState(node, context) || options[0]?.value || "";
  const variant = stringProp(node.props, "variant");
  const label = stringProp(node.props, "label");

  return (
    <div className={primitiveClass(node, "flex flex-col gap-2")}>
      {label ? <Label>{label}</Label> : null}
      <ToggleGroup
        type="single"
        value={value}
        variant={variant === "outline" ? "outline" : "default"}
        onValueChange={(nextValue) => {
          if (nextValue) {
            setNodeState(node, context, nextValue);
          }
        }}
        aria-label={
          label ?? stringProp(node.props, "stateKey") ?? "Toggle group"
        }
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Renders an inline calendar bound to ISO date or JSON range string state. */
function renderCalendar(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const value = getStringState(node, context);
  const mode = dateSelectionMode(node.props);
  const monthAnchor = selectedCalendarMonth(value, mode);
  const captionLayout = calendarCaptionLayout(node.props);
  const fromYear = numberProp(node.props, "fromYear");
  const toYear = numberProp(node.props, "toYear");
  const showOutsideDays = calendarShowOutsideDays(node.props);
  const label = stringProp(node.props, "label");

  if (mode === "range") {
    const selectedRange = parseDateRange(value);
    return (
      <div className={primitiveClass(node, "space-y-2")}>
        {label ? <Label>{label}</Label> : null}
        <div className="inline-flex w-fit max-w-full flex-col">
          <CalendarWithSyncedMonth
            mode="range"
            selected={selectedRange}
            monthAnchor={monthAnchor}
            captionLayout={captionLayout}
            fromYear={fromYear}
            toYear={toYear}
            {...calendarMonthProps(node.props)}
            showOutsideDays={showOutsideDays}
            onSelect={(range) =>
              setNodeState(node, context, formatDateRange(range))
            }
            initialFocus
          >
            {(syncMonth) => renderDatePresets(node, context, mode, syncMonth)}
          </CalendarWithSyncedMonth>
        </div>
      </div>
    );
  }

  const selectedDate = parseIsoDate(value);
  return (
    <div className={primitiveClass(node, "space-y-2")}>
      {label ? <Label>{label}</Label> : null}
      <div className="inline-flex w-fit max-w-full flex-col">
        <CalendarWithSyncedMonth
          mode="single"
          selected={selectedDate}
          monthAnchor={monthAnchor}
          captionLayout={captionLayout}
          fromYear={fromYear}
          toYear={toYear}
          {...calendarMonthProps(node.props)}
          showOutsideDays={showOutsideDays}
          onSelect={(date) => {
            if (date) {
              setNodeState(node, context, formatIsoDate(date));
            }
          }}
          initialFocus
        >
          {(syncMonth) => renderDatePresets(node, context, mode, syncMonth)}
        </CalendarWithSyncedMonth>
      </div>
    </div>
  );
}

/** Renders a popover date picker bound to ISO date or JSON range string state. */
function renderDatePicker(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const value = getStringState(node, context);
  const mode = dateSelectionMode(node.props);
  const monthAnchor = selectedCalendarMonth(value, mode);
  const captionLayout = calendarCaptionLayout(node.props);
  const fromYear = numberProp(node.props, "fromYear");
  const toYear = numberProp(node.props, "toYear");
  const showOutsideDays = calendarShowOutsideDays(node.props);
  const label = stringProp(node.props, "label");
  const placeholder =
    stringProp(node.props, "placeholder") ??
    (mode === "range" ? "Pick a date range" : "Pick a date");

  return (
    <div className={primitiveClass(node, "space-y-2")}>
      {label ? <Label>{label}</Label> : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {mode === "range"
              ? formatDateRangeLabel(value, placeholder)
              : formatDateLabel(value, placeholder)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {mode === "range" ? (
            <div className="inline-flex w-fit max-w-full flex-col">
              <CalendarWithSyncedMonth
                mode="range"
                selected={parseDateRange(value)}
                monthAnchor={monthAnchor}
                captionLayout={captionLayout}
                fromYear={fromYear}
                toYear={toYear}
                {...calendarMonthProps(node.props)}
                showOutsideDays={showOutsideDays}
                onSelect={(range) =>
                  setNodeState(node, context, formatDateRange(range))
                }
                initialFocus
              >
                {(syncMonth) =>
                  renderDatePresets(node, context, mode, syncMonth)
                }
              </CalendarWithSyncedMonth>
            </div>
          ) : (
            <div className="inline-flex w-fit max-w-full flex-col">
              <CalendarWithSyncedMonth
                mode="single"
                selected={parseIsoDate(value)}
                monthAnchor={monthAnchor}
                captionLayout={captionLayout}
                fromYear={fromYear}
                toYear={toYear}
                {...calendarMonthProps(node.props)}
                showOutsideDays={showOutsideDays}
                onSelect={(date) => {
                  if (date) {
                    setNodeState(node, context, formatIsoDate(date));
                  }
                }}
                initialFocus
              >
                {(syncMonth) =>
                  renderDatePresets(node, context, mode, syncMonth)
                }
              </CalendarWithSyncedMonth>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Renders a calendar paired with start/end time inputs. */
function renderDateTimePicker(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const value = getStringState(node, context);
  const selectedDate = parseIsoDate(value);
  const captionLayout = calendarCaptionLayout(node.props);
  const fromYear = numberProp(node.props, "fromYear");
  const toYear = numberProp(node.props, "toYear");
  const showOutsideDays = calendarShowOutsideDays(node.props);
  const label = stringProp(node.props, "label");
  const startTimeLabel = stringProp(node.props, "startTimeLabel") ?? "Start time";
  const endTimeLabel = stringProp(node.props, "endTimeLabel") ?? "End time";
  const startTimeKey =
    stringProp(node.props, "startTimeKey") ?? stringProp(node.props, "stateKey");
  const endTimeKey =
    stringProp(node.props, "endTimeKey") ?? stringProp(node.props, "stateKey");
  const startTimeValue = getStringStateByPropKey(
    node.props,
    context,
    "startTimeKey",
    "startTimeDefaultValue",
  );
  const endTimeValue = getStringStateByPropKey(
    node.props,
    context,
    "endTimeKey",
    "endTimeDefaultValue",
  );

  return (
    <div className={primitiveClass(node, "space-y-3")}>
      {label ? <Label>{label}</Label> : null}
      <div className="inline-flex w-fit max-w-full flex-col gap-3">
        <CalendarWithSyncedMonth
          mode="single"
          selected={selectedDate}
          monthAnchor={selectedDate}
          captionLayout={captionLayout}
          fromYear={fromYear}
          toYear={toYear}
          showOutsideDays={showOutsideDays}
          onSelect={(date) => {
            if (date) {
              setNodeState(node, context, formatIsoDate(date));
            }
          }}
          initialFocus
        >
          {(syncMonth) => renderDatePresets(node, context, "single", syncMonth)}
        </CalendarWithSyncedMonth>
        <div className="grid w-full min-w-0 gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={startTimeKey}>{startTimeLabel}</Label>
            <Input
              id={startTimeKey}
              type="time"
              step={1}
              className="min-w-0"
              value={startTimeValue}
              onChange={(event) =>
                setStateByPropKey(
                  node.props,
                  context,
                  "startTimeKey",
                  event.target.value,
                )
              }
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={endTimeKey}>{endTimeLabel}</Label>
            <Input
              id={endTimeKey}
              type="time"
              step={1}
              className="min-w-0"
              value={endTimeValue}
              onChange={(event) =>
                setStateByPropKey(
                  node.props,
                  context,
                  "endTimeKey",
                  event.target.value,
                )
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Renders a non-fatal missing reference placeholder. */
export function MissingOrionUiReference({
  label,
}: {
  label: string;
}): React.JSX.Element {
  return <MissingReference label={label} />;
}

function MissingReference({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="corner-squircle rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
      {label} could not be found.
    </div>
  );
}
