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

export interface NotebookAppViewSchemaPrimitiveRegistry {
  source: "builtin";
}

export interface NotebookAppViewSchemaNode {
  type: BuiltinAppViewPrimitive;
  props: Record<string, unknown>;
  children: NotebookAppViewSchemaNode[];
}

export interface NotebookAppViewSchema {
  version: typeof NOTEBOOK_APP_VIEW_SCHEMA_VERSION;
  primitiveRegistry: NotebookAppViewSchemaPrimitiveRegistry;
  root: NotebookAppViewSchemaNode;
}

export type NotebookAppViewReference =
  | { kind: "markdown"; cellId: string }
  | { kind: "output"; cellId: string; outputIndex: number };

export type OrionUiMimeStateValue = string | number | boolean;

export interface OrionUiMimePayload {
  version: typeof NOTEBOOK_APP_VIEW_SCHEMA_VERSION;
  id?: string;
  root: NotebookAppViewSchemaNode;
  state: Record<string, OrionUiMimeStateValue>;
  bindings: Record<string, unknown>;
}

export type NotebookAppViewSchemaParseResult =
  | { status: "missing" }
  | { status: "valid"; schema: NotebookAppViewSchema }
  | { status: "invalid"; errors: string[] };

export type OrionUiMimePayloadParseResult =
  | { status: "valid"; payload: OrionUiMimePayload }
  | { status: "invalid"; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Checks whether a schema node type is available in the built-in registry. */
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

/** Normalizes schema props and rejects unsupported styling escape hatches. */
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
      "style is not supported in app-view schema v1",
    );
  }

  return value;
}

/** Normalizes a recursive schema node into the renderer's internal shape. */
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

/** Reads the raw declarative schema object from notebook metadata. */
function getRawAppViewSchema(
  metadata: NotebookType["metadata"] | undefined,
): unknown {
  const orion = isRecord(metadata?.orion) ? metadata.orion : {};
  const appView = isRecord(orion.appView) ? orion.appView : {};
  return appView.schema;
}

/** Reads App View scoped CSS from notebook metadata when present. */
export function getNotebookAppViewCss(
  metadata: NotebookType["metadata"] | undefined,
): string | undefined {
  const orion = isRecord(metadata?.orion) ? metadata.orion : {};
  const appView = isRecord(orion.appView) ? orion.appView : {};
  return typeof appView.css === "string" ? appView.css : undefined;
}

/**
 * Parses notebook-level declarative App View schema metadata.
 */
export function parseNotebookAppViewSchema(
  metadata: NotebookType["metadata"] | undefined,
): NotebookAppViewSchemaParseResult {
  const rawSchema = getRawAppViewSchema(metadata);
  if (rawSchema === undefined) {
    return { status: "missing" };
  }

  const errors: string[] = [];
  if (!isRecord(rawSchema)) {
    return {
      status: "invalid",
      errors: ["metadata.orion.appView.schema: schema must be an object"],
    };
  }

  if (rawSchema.version !== NOTEBOOK_APP_VIEW_SCHEMA_VERSION) {
    appendSchemaError(
      errors,
      "metadata.orion.appView.schema.version",
      `version must be ${NOTEBOOK_APP_VIEW_SCHEMA_VERSION}`,
    );
  }

  const primitiveRegistry = isRecord(rawSchema.primitiveRegistry)
    ? rawSchema.primitiveRegistry
    : {};
  if (primitiveRegistry.source !== "builtin") {
    appendSchemaError(
      errors,
      "metadata.orion.appView.schema.primitiveRegistry.source",
      "only 'builtin' is supported",
    );
  }

  if (rawSchema.root === undefined) {
    appendSchemaError(
      errors,
      "metadata.orion.appView.schema.root",
      "root is required",
    );
  }

  const root =
    rawSchema.root === undefined
      ? null
      : normalizeSchemaNode(
          rawSchema.root,
          "metadata.orion.appView.schema.root",
          errors,
        );

  if (errors.length > 0 || !root) {
    return { status: "invalid", errors };
  }

  return {
    status: "valid",
    schema: {
      version: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
      primitiveRegistry: { source: "builtin" },
      root,
    },
  };
}

/** Creates the default schema used by manual App View additions. */
export function createDefaultNotebookAppViewSchema(): NotebookAppViewSchema {
  return {
    version: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
    primitiveRegistry: { source: "builtin" },
    root: {
      type: "Page",
      props: { gap: "lg", padding: "md" },
      children: [],
    },
  };
}

/** Returns the stable Orion-managed id for a notebook cell. */
export function getNotebookCellId(cell: NotebookCellType): string | null {
  const id = cell.metadata?.orion?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function getEditableAppViewSchema(
  metadata: NotebookType["metadata"] | undefined,
): NotebookAppViewSchema | null {
  const result = parseNotebookAppViewSchema(metadata);
  if (result.status === "valid") {
    return result.schema;
  }
  if (result.status === "missing") {
    return createDefaultNotebookAppViewSchema();
  }
  return null;
}

function cloneSchemaNode(
  node: NotebookAppViewSchemaNode,
): NotebookAppViewSchemaNode {
  return {
    type: node.type,
    props: { ...node.props },
    children: node.children.map(cloneSchemaNode),
  };
}

function cloneSchema(schema: NotebookAppViewSchema): NotebookAppViewSchema {
  return {
    version: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
    primitiveRegistry: { source: "builtin" },
    root: cloneSchemaNode(schema.root),
  };
}

function numberProp(
  props: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringProp(
  props: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = props[key];
  return typeof value === "string" ? value : undefined;
}

function referenceMatchesNode(
  node: NotebookAppViewSchemaNode,
  reference: NotebookAppViewReference,
): boolean {
  if (reference.kind === "markdown") {
    return (
      node.type === "MarkdownCell" &&
      stringProp(node.props, "cellId") === reference.cellId
    );
  }

  return (
    node.type === "Output" &&
    stringProp(node.props, "cellId") === reference.cellId &&
    Math.max(0, Math.floor(numberProp(node.props, "outputIndex") ?? 0)) ===
      reference.outputIndex
  );
}

function schemaNodeHasReference(
  node: NotebookAppViewSchemaNode,
  reference: NotebookAppViewReference,
): boolean {
  return (
    referenceMatchesNode(node, reference) ||
    node.children.some((child) => schemaNodeHasReference(child, reference))
  );
}

/** Checks whether a declarative App View schema references a cell or output. */
export function isNotebookAppViewReferenceInSchema(
  schema: NotebookAppViewSchema,
  reference: NotebookAppViewReference,
): boolean {
  return schemaNodeHasReference(schema.root, reference);
}

/** Checks whether notebook metadata has a valid schema reference for a cell or output. */
export function isNotebookAppViewReferenceInMetadata(
  metadata: NotebookType["metadata"] | undefined,
  reference: NotebookAppViewReference,
): boolean {
  const result = parseNotebookAppViewSchema(metadata);
  return (
    result.status === "valid" &&
    isNotebookAppViewReferenceInSchema(result.schema, reference)
  );
}

function createReferenceNode(
  reference: NotebookAppViewReference,
): NotebookAppViewSchemaNode {
  if (reference.kind === "markdown") {
    return {
      type: "MarkdownCell",
      props: { cellId: reference.cellId },
      children: [],
    };
  }

  return {
    type: "Output",
    props: { cellId: reference.cellId, outputIndex: reference.outputIndex },
    children: [],
  };
}

function withRootPage(schema: NotebookAppViewSchema): NotebookAppViewSchema {
  const cloned = cloneSchema(schema);
  if (cloned.root.type === "Page") {
    return cloned;
  }

  return {
    ...cloned,
    root: {
      type: "Page",
      props: { gap: "lg", padding: "md" },
      children: [cloned.root],
    },
  };
}

/** Adds a cell/output reference to the root Page unless it already exists. */
export function addNotebookAppViewReferenceToSchema(
  schema: NotebookAppViewSchema,
  reference: NotebookAppViewReference,
): NotebookAppViewSchema {
  if (isNotebookAppViewReferenceInSchema(schema, reference)) {
    return cloneSchema(schema);
  }

  const nextSchema = withRootPage(schema);
  nextSchema.root.children = [
    ...nextSchema.root.children,
    createReferenceNode(reference),
  ];
  return nextSchema;
}

function removeReferenceFromNode(
  node: NotebookAppViewSchemaNode,
  reference: NotebookAppViewReference,
): NotebookAppViewSchemaNode | null {
  if (referenceMatchesNode(node, reference)) {
    return null;
  }

  return {
    type: node.type,
    props: { ...node.props },
    children: node.children.flatMap((child) => {
      const nextChild = removeReferenceFromNode(child, reference);
      return nextChild ? [nextChild] : [];
    }),
  };
}

/** Removes all matching cell/output references from a schema. */
export function removeNotebookAppViewReferenceFromSchema(
  schema: NotebookAppViewSchema,
  reference: NotebookAppViewReference,
): NotebookAppViewSchema {
  const nextRoot = removeReferenceFromNode(schema.root, reference);
  return {
    version: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
    primitiveRegistry: { source: "builtin" },
    root: nextRoot ?? createDefaultNotebookAppViewSchema().root,
  };
}

/** Writes the declarative App View schema into notebook metadata. */
export function withNotebookAppViewSchema(
  notebook: NotebookType,
  schema: NotebookAppViewSchema,
): NotebookType {
  const metadata = notebook.metadata ?? {};
  const orion = isRecord(metadata.orion) ? metadata.orion : {};
  const appView = isRecord(orion.appView) ? orion.appView : {};

  return {
    ...notebook,
    metadata: {
      ...metadata,
      orion: {
        ...orion,
        appView: {
          ...appView,
          schema,
        },
      },
    },
  };
}

/** Adds a cell/output reference to notebook-level App View schema metadata. */
export function addNotebookAppViewReference(
  notebook: NotebookType,
  reference: NotebookAppViewReference,
): NotebookType {
  const schema = getEditableAppViewSchema(notebook.metadata);
  if (!schema) {
    return notebook;
  }

  return withNotebookAppViewSchema(
    notebook,
    addNotebookAppViewReferenceToSchema(schema, reference),
  );
}

/** Removes a cell/output reference from notebook-level App View schema metadata. */
export function removeNotebookAppViewReference(
  notebook: NotebookType,
  reference: NotebookAppViewReference,
): NotebookType {
  const result = parseNotebookAppViewSchema(notebook.metadata);
  if (result.status !== "valid") {
    return notebook;
  }

  return withNotebookAppViewSchema(
    notebook,
    removeNotebookAppViewReferenceFromSchema(result.schema, reference),
  );
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
