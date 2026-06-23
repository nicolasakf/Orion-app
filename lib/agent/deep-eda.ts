import { z } from "zod";

import { TOOL_OUTPUT_IMAGE_BASE64_CHAR_BUDGET, guardToolText } from "./tool-output-guard";

/** Raster MIME types that Orion requires the agent to inspect after generation. */
export const INSPECTABLE_RASTER_MIME_TYPES = ["image/png", "image/jpeg"] as const;

export const InspectableRasterMimeTypeSchema = z.enum(INSPECTABLE_RASTER_MIME_TYPES);
export type InspectableRasterMimeType = z.infer<typeof InspectableRasterMimeTypeSchema>;

/** One agent-generated raster output carried back to the model for inspection. */
export interface AgentVisualOutput {
  visualId: string;
  mimeType: InspectableRasterMimeType;
  data?: string;
  source: "execute_cell" | "execute_code";
  cellIndex?: number;
  outputIndex: number;
  byteLength: number;
  visualInspectionUnavailableReason?: string;
}

/** Structured result returned when an execution produced inspectable raster output. */
export interface ExecutionToolResult {
  text: string;
  visuals: AgentVisualOutput[];
}

/** True when a tool result contains agent-generated raster outputs. */
export function isExecutionToolResult(value: unknown): value is ExecutionToolResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.text === "string" && Array.isArray(record.visuals);
}

/** Applies context guardrails while retaining metadata needed for fallback validation. */
export function guardExecutionToolResult(
  result: ExecutionToolResult,
  imageMaxBase64Chars = TOOL_OUTPUT_IMAGE_BASE64_CHAR_BUDGET
): ExecutionToolResult {
  return {
    text: guardToolText(result.text).text,
    visuals: result.visuals.map((visual) => {
      if (!visual.data || visual.data.length <= imageMaxBase64Chars) return visual;
      return {
        ...visual,
        data: undefined,
        visualInspectionUnavailableReason:
          `preview exceeded the ${imageMaxBase64Chars}-character image budget`,
      };
    }),
  };
}

/** Builds a smaller browser-generated preview without changing the notebook output. */
async function resizeRasterPreview(
  visual: AgentVisualOutput,
  maxBase64Chars: number
): Promise<string | null> {
  if (!visual.data || typeof document === "undefined") return null;

  const image = new Image();
  image.src = `data:${visual.mimeType};base64,${visual.data}`;
  try {
    await image.decode();
  } catch {
    return null;
  }

  let scale = Math.min(0.9, Math.sqrt(maxBase64Chars / visual.data.length) * 0.9);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(visual.mimeType, visual.mimeType === "image/jpeg" ? 0.82 : undefined);
    const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (encoded.length <= maxBase64Chars) return encoded;
    scale *= 0.7;
  }
  return null;
}

/** Prepares raster previews according to model capability and the configured budget. */
export async function prepareExecutionToolResultForModel(options: {
  result: ExecutionToolResult;
  supportsImageInput: boolean;
  imageMaxBase64Chars: number;
}): Promise<ExecutionToolResult> {
  const visuals = await Promise.all(
    options.result.visuals.map(async (visual) => {
      if (!options.supportsImageInput) {
        return {
          ...visual,
          data: undefined,
          visualInspectionUnavailableReason: "the selected model does not support image input",
        };
      }
      if (!visual.data || visual.data.length <= options.imageMaxBase64Chars) return visual;
      const resized = await resizeRasterPreview(visual, options.imageMaxBase64Chars);
      return resized
        ? { ...visual, data: resized }
        : {
            ...visual,
            data: undefined,
            visualInspectionUnavailableReason:
              "Orion could not create a preview within the configured image budget",
          };
    })
  );
  return { ...options.result, visuals };
}

export const DEEP_EDA_COVERAGE_AREAS = [
  "schema_integrity",
  "missingness_quality",
  "univariate_distributions",
  "relationships_segments",
  "anomalies_outliers",
  "task_specific_risks",
  "synthesis_limitations",
] as const;

export type DeepEdaCoverageArea = (typeof DEEP_EDA_COVERAGE_AREAS)[number];

export const DeepEdaStateSnapshotSchema = z.object({
  coverage: z.array(
    z.object({
      area: z.enum(DEEP_EDA_COVERAGE_AREAS),
      status: z.enum(["pending", "in_progress", "complete", "not_applicable"]),
      evidenceRefs: z.array(z.string()),
      rationale: z.string(),
    })
  ),
  findings: z.array(
    z.object({
      claim: z.string(),
      evidenceRefs: z.array(z.string()).min(1),
      confidence: z.enum(["low", "medium", "high"]),
    })
  ),
  openQuestions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      priority: z.enum(["low", "medium", "high"]),
      nextAction: z.string(),
    })
  ),
});

export type DeepEdaStateSnapshot = z.infer<typeof DeepEdaStateSnapshotSchema>;

export const DeepEdaStateUpdateSchema = z.object({
  coverageUpdates: z.array(DeepEdaStateSnapshotSchema.shape.coverage.element).default([]),
  findingsToAdd: z.array(DeepEdaStateSnapshotSchema.shape.findings.element).default([]),
  openQuestionsUpsert: z.array(DeepEdaStateSnapshotSchema.shape.openQuestions.element).default([]),
  resolvedQuestionIds: z.array(z.string().min(1)).default([]),
});

export type DeepEdaStateUpdate = z.infer<typeof DeepEdaStateUpdateSchema>;

export type DeepEdaPhase =
  | "inactive"
  | "investigating"
  | "awaiting_visual_inspection"
  | "revising_visual"
  | "synthesizing";

/** Creates the empty ledger used when an exhaustive EDA run begins. */
export function createInitialDeepEdaState(): DeepEdaStateSnapshot {
  return {
    coverage: DEEP_EDA_COVERAGE_AREAS.map((area) => ({
      area,
      status: "pending" as const,
      evidenceRefs: [],
      rationale: "",
    })),
    findings: [],
    openQuestions: [],
  };
}

/** Merge a compact incremental update into Orion's canonical deep-EDA ledger. */
export function applyDeepEdaStateUpdate(
  state: DeepEdaStateSnapshot,
  update: DeepEdaStateUpdate
): DeepEdaStateSnapshot {
  const coverageUpdates = new Map(update.coverageUpdates.map((item) => [item.area, item]));
  const findings = new Map(
    state.findings.map((finding) => [
      `${finding.claim}\u0000${finding.evidenceRefs.join("\u0000")}`,
      finding,
    ])
  );
  for (const finding of update.findingsToAdd) {
    findings.set(`${finding.claim}\u0000${finding.evidenceRefs.join("\u0000")}`, finding);
  }

  const resolvedQuestionIds = new Set(update.resolvedQuestionIds);
  const openQuestions = new Map(
    state.openQuestions
      .filter((question) => !resolvedQuestionIds.has(question.id))
      .map((question) => [question.id, question])
  );
  for (const question of update.openQuestionsUpsert) {
    if (!resolvedQuestionIds.has(question.id)) openQuestions.set(question.id, question);
  }

  return {
    coverage: state.coverage.map((item) => coverageUpdates.get(item.area) ?? item),
    findings: Array.from(findings.values()),
    openQuestions: Array.from(openQuestions.values()),
  };
}

/** Derive the controller phase from durable ledger and visual-inspection state. */
export function getDeepEdaPhase(options: {
  active: boolean;
  state?: DeepEdaStateSnapshot;
  pendingVisualIds: string[];
  revisionRequiredIds: string[];
}): DeepEdaPhase {
  if (!options.active) return "inactive";
  if (options.pendingVisualIds.length > 0) return "awaiting_visual_inspection";
  if (options.revisionRequiredIds.length > 0) return "revising_visual";
  if (
    options.state?.coverage.every(
      (item) => item.status === "complete" || item.status === "not_applicable"
    )
  ) {
    return "synthesizing";
  }
  return "investigating";
}

/** Build the compact progress summary injected on every active controller step. */
export function summarizeDeepEdaState(state?: DeepEdaStateSnapshot): string {
  if (!state) return "Ledger unavailable; record the next evidence increment.";
  const coverage = state.coverage.map((item) => `${item.area}:${item.status}`).join(", ");
  const highPriorityQuestions = state.openQuestions.filter(
    (question) => question.priority === "high"
  ).length;
  return `Coverage: ${coverage}. Findings: ${state.findings.length}. Open questions: ${state.openQuestions.length} (${highPriorityQuestions} high priority).`;
}

/** Deterministically evaluates whether a deep EDA completion proposal is admissible. */
export function validateDeepEdaCompletion(options: {
  state: DeepEdaStateSnapshot;
  pendingVisualIds: string[];
  unresolvedVisualRevisionIds?: string[];
  inspectedVisualCount?: number;
  synthesisCellIndices: number[];
}): string[] {
  const missing: string[] = [];
  const coverageByArea = new Map(options.state.coverage.map((item) => [item.area, item]));

  for (const area of DEEP_EDA_COVERAGE_AREAS) {
    const item = coverageByArea.get(area);
    if (!item || (item.status !== "complete" && item.status !== "not_applicable")) {
      missing.push(`Coverage area '${area}' is not complete.`);
      continue;
    }
    if (item.status === "complete" && item.evidenceRefs.length === 0) {
      missing.push(`Coverage area '${area}' has no evidence references.`);
    }
    if (item.status === "not_applicable" && item.rationale.trim().length === 0) {
      missing.push(`Coverage area '${area}' needs a not-applicable rationale.`);
    }
  }

  if (options.pendingVisualIds.length > 0) {
    missing.push(`Uninspected raster outputs remain: ${options.pendingVisualIds.join(", ")}.`);
  }
  if ((options.unresolvedVisualRevisionIds?.length ?? 0) > 0) {
    missing.push(
      `Raster outputs still require corrected replacements: ${options.unresolvedVisualRevisionIds!.join(", ")}.`
    );
  }
  if ((options.inspectedVisualCount ?? 0) < 1) {
    missing.push("At least one agent-generated PNG/JPEG plot must be inspected before deep EDA can complete.");
  }
  if (options.state.openQuestions.some((question) => question.priority === "high")) {
    missing.push("One or more high-priority investigative questions remain open.");
  }
  if (options.state.findings.length === 0) {
    missing.push("No evidence-backed findings have been recorded.");
  }
  if (options.synthesisCellIndices.length === 0) {
    missing.push("A durable notebook synthesis cell is required.");
  }

  return missing;
}
