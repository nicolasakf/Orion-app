"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

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

/** Renders an inline calendar bound to ISO date string state. */
function renderCalendar(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const value = getStringState(node, context);
  const selected = parseIsoDate(value);

  return (
    <Calendar
      mode="single"
      selected={selected}
      className={primitiveClass(node)}
      onSelect={(date) => {
        if (date) {
          setNodeState(node, context, formatIsoDate(date));
        }
      }}
      initialFocus
    />
  );
}

/** Renders a popover date picker bound to ISO date string state. */
function renderDatePicker(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
): React.ReactNode {
  const value = getStringState(node, context);
  const selected = parseIsoDate(value);
  const placeholder =
    stringProp(node.props, "placeholder") ?? "Pick a date";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={primitiveClass(
            node,
            "justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatDateLabel(value, placeholder)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              setNodeState(node, context, formatIsoDate(date));
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
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
