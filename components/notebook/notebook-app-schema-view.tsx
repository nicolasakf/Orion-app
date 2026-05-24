"use client";

import React, { useCallback, useMemo, useState } from "react";

import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import { OutputRenderer } from "@/components/notebook/output-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  getNotebookCellId,
  type BuiltinAppViewPrimitive,
  type NotebookAppViewSchema,
  type NotebookAppViewSchemaNode,
} from "@/lib/notebook/app-view";
import { cn } from "@/lib/utils";
import { CellType, type NotebookCellType, type NotebookType } from "@/lib/types";

type LocalValue = string | number | boolean;
type PrimitiveRenderer = (
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
) => React.ReactNode;

interface SchemaRenderContext {
  notebook: NotebookType;
  cellsById: Map<string, { cell: NotebookCellType; cellIndex: number }>;
  state: Record<string, LocalValue>;
  setStateValue: (key: string, value: LocalValue) => void;
  renderNode: (node: NotebookAppViewSchemaNode) => React.ReactNode;
  renderChildren: (node: NotebookAppViewSchemaNode) => React.ReactNode;
}

interface NotebookAppSchemaViewProps {
  notebook: NotebookType;
  schema: NotebookAppViewSchema;
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

const builtinPrimitiveRenderers: Record<
  BuiltinAppViewPrimitive,
  PrimitiveRenderer
> = {
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
  Label: renderLabel,
  Badge: renderBadge,
  Separator: renderSeparator,
};

/** Returns a string prop from a schema node when present. */
function stringProp(
  props: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = props[key];
  return typeof value === "string" ? value : undefined;
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

/** Writes local control state when a schema node declares a state key. */
function setNodeState(
  node: NotebookAppViewSchemaNode,
  context: SchemaRenderContext,
  value: LocalValue,
): void {
  const stateKey = stringProp(node.props, "stateKey");
  if (stateKey) {
    context.setStateValue(stateKey, value);
  }
}

/** Builds a lookup table for stable cell id references. */
function getCellsById(
  cells: NotebookCellType[],
): Map<string, { cell: NotebookCellType; cellIndex: number }> {
  const entries = cells.flatMap((cell, cellIndex) => {
    const cellId = getNotebookCellId(cell);
    return cellId ? [[cellId, { cell, cellIndex }] as const] : [];
  });

  return new Map(entries);
}

/** Extracts notebook cell source as a single markdown string. */
function sourceToString(source: string[] | undefined): string {
  return Array.isArray(source) ? source.join("") : "";
}

/** Renders a declarative App View schema using the built-in primitive registry. */
export function NotebookAppSchemaView({
  notebook,
  schema,
}: NotebookAppSchemaViewProps): React.JSX.Element {
  const [state, setState] = useState<Record<string, LocalValue>>({});
  const cellsById = useMemo(
    () => getCellsById(notebook.cells),
    [notebook.cells],
  );

  const setStateValue = useCallback((key: string, value: LocalValue) => {
    setState((current) => ({ ...current, [key]: value }));
  }, []);

  const context = useMemo<SchemaRenderContext>(() => {
    const renderNode = (node: NotebookAppViewSchemaNode): React.ReactNode =>
      builtinPrimitiveRenderers[node.type](node, context);

    const renderChildren = (node: NotebookAppViewSchemaNode): React.ReactNode =>
      node.children.map((child, index) => (
        <React.Fragment key={`${child.type}-${index}`}>
          {renderNode(child)}
        </React.Fragment>
      ));

    const context: SchemaRenderContext = {
      notebook,
      cellsById,
      state,
      setStateValue,
      renderNode,
      renderChildren,
    };

    return context;
  }, [cellsById, notebook, setStateValue, state]);

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto bg-sidebar"
      data-notebook-export-root="app"
    >
      {context.renderNode(schema.root)}
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
      className={cn("w-full", spacingClass(node.props.padding, paddingClasses))}
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
    <Card>
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
    <Tabs defaultValue={defaultValue} className="w-full">
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
  const entry = cellId ? context.cellsById.get(cellId) : undefined;
  const source =
    stringProp(node.props, "source") ??
    stringProp(node.props, "text") ??
    (entry?.cell.cell_type === CellType.MARKDOWN
      ? sourceToString(entry.cell.source)
      : undefined);

  return source ? (
    <MarkdownRenderer source={source} />
  ) : (
    <MissingReference
      label={cellId ? `Markdown cell '${cellId}'` : "Markdown source"}
    />
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
  const entry = cellId ? context.cellsById.get(cellId) : undefined;
  const output = entry?.cell.outputs?.[outputIndex];

  return output && entry ? (
    <OutputRenderer
      output={output}
      notebookMetadata={context.notebook.metadata}
      cellIndex={entry.cellIndex}
      outputIndex={outputIndex}
    />
  ) : (
    <MissingReference
      label={cellId ? `Output ${outputIndex} from '${cellId}'` : "Output"}
    />
  );
}

/** Renders a non-action button for v1 local UI composition. */
function renderButton(node: NotebookAppViewSchemaNode): React.ReactNode {
  const label =
    stringProp(node.props, "label") ??
    stringProp(node.props, "text") ??
    "Button";
  const variant = stringProp(node.props, "variant");
  const size = stringProp(node.props, "size");

  return (
    <Button
      type="button"
      variant={
        variant === "secondary" || variant === "outline" || variant === "ghost"
          ? variant
          : "default"
      }
      size={size === "sm" || size === "lg" ? size : "default"}
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
    <label className="flex items-center gap-2 text-sm">
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
    <label className="flex items-center gap-2 text-sm">
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

  return <Label>{text ?? context.renderChildren(node)}</Label>;
}

/** Renders a small badge with constrained variants. */
function renderBadge(node: NotebookAppViewSchemaNode): React.ReactNode {
  const text =
    stringProp(node.props, "text") ?? stringProp(node.props, "label") ?? "";
  const variant = stringProp(node.props, "variant");

  return (
    <Badge
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
function renderSeparator(): React.ReactNode {
  return <Separator />;
}

/** Renders a non-fatal missing reference placeholder. */
function MissingReference({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="corner-squircle rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
      {label} could not be found.
    </div>
  );
}
