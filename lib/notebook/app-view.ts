import { type NotebookCellType, type NotebookType } from "@/lib/types";

export const NOTEBOOK_APP_VIEW_SCHEMA_VERSION = 1;
export const ORION_UI_MIME_TYPE = "application/vnd.orion.ui+json";

export const BUILTIN_APP_VIEW_PRIMITIVES = [
  "Page",
  "Stack",
  "Grid",
  "Section",
  "Card",
  "Tabs",
  "MarkdownCell",
  "Output",
  "Button",
  "Input",
  "Textarea",
  "Select",
  "Slider",
  "Checkbox",
  "Switch",
  "RadioGroup",
  "Toggle",
  "ToggleGroup",
  "Calendar",
  "DatePicker",
  "DateRangeSlider",
  "DateTimePicker",
  "Label",
  "Badge",
  "Separator",
  "Alert",
  "Progress",
  "Avatar",
  "Popover",
  "HoverCard",
  "Tooltip",
  "Carousel",
  "Collapsible",
  "Accordion",
] as const;

export type BuiltinAppViewPrimitive =
  (typeof BUILTIN_APP_VIEW_PRIMITIVES)[number];

export interface NotebookAppViewSchemaNode {
  type: BuiltinAppViewPrimitive;
  props: Record<string, unknown>;
  children: NotebookAppViewSchemaNode[];
}

export type NotebookAppViewReference =
  | { kind: "markdown"; cellIndex: number }
  | { kind: "output"; cellIndex: number; outputIndex: number };

export type OrionUiMimeStateValue = string | number | boolean;

export interface OrionUiMimePayload {
  version: typeof NOTEBOOK_APP_VIEW_SCHEMA_VERSION;
  id?: string;
  root: NotebookAppViewSchemaNode;
  state: Record<string, OrionUiMimeStateValue>;
  bindings: Record<string, unknown>;
}

export type OrionUiMimePayloadParseResult =
  | { status: "valid"; payload: OrionUiMimePayload }
  | { status: "invalid"; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Checks whether a primitive node type is available in the built-in registry. */
function isBuiltinAppViewPrimitive(
  value: unknown,
): value is BuiltinAppViewPrimitive {
  return (
    typeof value === "string" &&
    (BUILTIN_APP_VIEW_PRIMITIVES as readonly string[]).includes(value)
  );
}

/** Adds a path-qualified schema validation message. */
function appendSchemaError(
  errors: string[],
  path: string,
  message: string,
): void {
  errors.push(`${path}: ${message}`);
}

/** Normalizes primitive props and rejects unsupported styling escape hatches. */
function normalizeSchemaProps(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    appendSchemaError(errors, path, "props must be an object when present");
    return {};
  }

  if ("className" in value && typeof value.className !== "string") {
    appendSchemaError(
      errors,
      `${path}.className`,
      "className must be a string when present",
    );
  }

  if ("style" in value) {
    appendSchemaError(
      errors,
      `${path}.style`,
      "style is not supported in Orion UI primitive payload v1",
    );
  }

  return value;
}

/** Normalizes a recursive primitive node into the renderer's internal shape. */
function normalizeSchemaNode(
  value: unknown,
  path: string,
  errors: string[],
): NotebookAppViewSchemaNode | null {
  if (!isRecord(value)) {
    appendSchemaError(errors, path, "node must be an object");
    return null;
  }

  if (!isBuiltinAppViewPrimitive(value.type)) {
    appendSchemaError(
      errors,
      `${path}.type`,
      `unknown primitive '${String(value.type)}'`,
    );
    return null;
  }

  const children: NotebookAppViewSchemaNode[] = [];
  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) {
      appendSchemaError(
        errors,
        `${path}.children`,
        "children must be an array",
      );
    } else {
      value.children.forEach((child, index) => {
        const normalized = normalizeSchemaNode(
          child,
          `${path}.children[${index}]`,
          errors,
        );
        if (normalized) {
          children.push(normalized);
        }
      });
    }
  }

  return {
    type: value.type,
    props: normalizeSchemaProps(value.props, `${path}.props`, errors),
    children,
  };
}

/** Checks whether a markdown cell is included in App View. */
export function isNotebookCellInAppView(cell: NotebookCellType): boolean {
  return cell.metadata?.orion?.app?.enabled === true;
}

/** Checks whether a code-cell output is included in App View. */
export function isNotebookOutputInAppView(
  cell: NotebookCellType,
  outputIndex: number,
): boolean {
  const outputs = cell.metadata?.orion?.app?.outputs;
  if (!isRecord(outputs)) {
    return false;
  }

  const outputMetadata = outputs[String(outputIndex)];
  return isRecord(outputMetadata) && outputMetadata.enabled === true;
}

/** Checks whether the selected cell or output is included in App View. */
export function isNotebookAppViewReferenceInNotebook(
  notebook: NotebookType,
  reference: NotebookAppViewReference,
): boolean {
  const cell = notebook.cells[reference.cellIndex];
  if (!cell) {
    return false;
  }

  return reference.kind === "markdown"
    ? isNotebookCellInAppView(cell)
    : isNotebookOutputInAppView(cell, reference.outputIndex);
}

function withoutUndefinedRecordEntries(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function isEmptyRecord(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 0;
}

function updateNotebookCellAppMetadata(
  notebook: NotebookType,
  cellIndex: number,
  updater: (app: Record<string, unknown>) => Record<string, unknown>,
): NotebookType {
  const cell = notebook.cells[cellIndex];
  if (!cell) {
    return notebook;
  }

  const metadata = isRecord(cell.metadata) ? { ...cell.metadata } : {};
  const orion = isRecord(metadata.orion) ? { ...metadata.orion } : {};
  const app = isRecord(orion.app) ? { ...orion.app } : {};
  const nextApp = withoutUndefinedRecordEntries(updater(app));

  if (isEmptyRecord(nextApp)) {
    delete orion.app;
  } else {
    orion.app = nextApp;
  }

  if (isEmptyRecord(orion)) {
    delete metadata.orion;
  } else {
    metadata.orion = orion;
  }

  const cells = notebook.cells.slice();
  cells[cellIndex] = {
    ...cell,
    metadata,
  };

  return {
    ...notebook,
    cells,
  };
}

/** Adds a cell or output to App View cell-level metadata. */
export function addNotebookAppViewReference(
  notebook: NotebookType,
  reference: NotebookAppViewReference,
): NotebookType {
  return updateNotebookCellAppMetadata(notebook, reference.cellIndex, (app) => {
    if (reference.kind === "markdown") {
      return { ...app, enabled: true };
    }

    const outputs = isRecord(app.outputs) ? { ...app.outputs } : {};
    const outputKey = String(reference.outputIndex);
    const outputMetadata = isRecord(outputs[outputKey])
      ? { ...outputs[outputKey] }
      : {};

    return {
      ...app,
      outputs: {
        ...outputs,
        [outputKey]: {
          ...outputMetadata,
          enabled: true,
        },
      },
    };
  });
}

/** Removes a cell or output from App View cell-level metadata. */
export function removeNotebookAppViewReference(
  notebook: NotebookType,
  reference: NotebookAppViewReference,
): NotebookType {
  return updateNotebookCellAppMetadata(notebook, reference.cellIndex, (app) => {
    if (reference.kind === "markdown") {
      const nextApp = { ...app };
      delete nextApp.enabled;
      return nextApp;
    }

    const outputs = isRecord(app.outputs) ? { ...app.outputs } : {};
    delete outputs[String(reference.outputIndex)];
    const nextApp = { ...app };

    if (isEmptyRecord(outputs)) {
      delete nextApp.outputs;
    } else {
      nextApp.outputs = outputs;
    }

    return nextApp;
  });
}

/** Parses an Orion UI MIME payload into the shared primitive tree shape. */
export function parseOrionUiMimePayload(
  value: unknown,
): OrionUiMimePayloadParseResult {
  const errors: string[] = [];
  const rawPayload =
    typeof value === "string"
      ? (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          errors.push(
            `${ORION_UI_MIME_TYPE}: payload string must be valid JSON`,
          );
          return null;
        }
      })()
      : value;

  if (!isRecord(rawPayload)) {
    return {
      status: "invalid",
      errors:
        errors.length > 0
          ? errors
          : [`${ORION_UI_MIME_TYPE}: payload must be an object`],
    };
  }

  if (rawPayload.version !== NOTEBOOK_APP_VIEW_SCHEMA_VERSION) {
    appendSchemaError(
      errors,
      `${ORION_UI_MIME_TYPE}.version`,
      `version must be ${NOTEBOOK_APP_VIEW_SCHEMA_VERSION}`,
    );
  }

  if (rawPayload.id !== undefined && typeof rawPayload.id !== "string") {
    appendSchemaError(
      errors,
      `${ORION_UI_MIME_TYPE}.id`,
      "id must be a string",
    );
  }

  if (rawPayload.root === undefined) {
    appendSchemaError(errors, `${ORION_UI_MIME_TYPE}.root`, "root is required");
  }

  const root =
    rawPayload.root === undefined
      ? null
      : normalizeSchemaNode(
        rawPayload.root,
        `${ORION_UI_MIME_TYPE}.root`,
        errors,
      );

  const rawState = isRecord(rawPayload.state) ? rawPayload.state : {};
  const state: Record<string, OrionUiMimeStateValue> = {};
  for (const [key, entry] of Object.entries(rawState)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      state[key] = entry;
    } else {
      appendSchemaError(
        errors,
        `${ORION_UI_MIME_TYPE}.state.${key}`,
        "state values must be strings, numbers, or booleans",
      );
    }
  }

  if (errors.length > 0 || !root) {
    return { status: "invalid", errors };
  }

  return {
    status: "valid",
    payload: {
      version: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
      id: typeof rawPayload.id === "string" ? rawPayload.id : undefined,
      root,
      state,
      bindings: isRecord(rawPayload.bindings) ? rawPayload.bindings : {},
    },
  };
}
